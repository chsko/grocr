import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { templateDays } from './lib/advent';
import { groupWithMembers, setup, signedInUser } from './test.setup';

// Advent calendars are hidden from every member they are for (ADR 0003). Most tests here check
// that a recipient sees nothing about their calendar, not even in error codes.

const DECEMBER = templateDays(2026, 'december');
const SUNDAYS = templateDays(2026, 'sundays');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-04T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

async function family() {
  const t = setup();
  const mum = await signedInUser(t, 'Kari');
  const dad = await signedInUser(t, 'Ola');
  const emma = await signedInUser(t, 'Emma');
  const jonas = await signedInUser(t, 'Jonas');
  const eve = await signedInUser(t, 'Eve');
  const groupId = await groupWithMembers(t, [mum.userId, dad.userId, emma.userId, jonas.userId]);
  const otherGroupId = await groupWithMembers(t, [eve.userId]);
  return { t, mum, dad, emma, jonas, eve, groupId, otherGroupId };
}

/** Kari makes a 24-day calendar for Emma and a Sunday calendar for both children. */
async function planned() {
  const f = await family();
  const { mum, emma, jonas, groupId } = f;
  const emmas = await mum.as.mutation(api.advent.createCalendar, {
    groupId,
    year: 2026,
    recipientIds: [emma.userId],
    days: DECEMBER,
  });
  const sundays = await mum.as.mutation(api.advent.createCalendar, {
    groupId,
    year: 2026,
    recipientIds: [emma.userId, jonas.userId],
    days: SUNDAYS,
    name: ' Søndagskalender ',
  });
  await mum.as.mutation(api.advent.setDoor, {
    calendarId: emmas,
    day: '2026-12-04',
    title: 'Eraser',
    status: 'wrapped',
    price: 29,
    note: '',
  });
  await mum.as.mutation(api.advent.setDoor, {
    calendarId: emmas,
    day: '2026-12-05',
    title: 'Pencils',
    status: 'bought',
    price: 89.5,
    note: 'Bookshop',
  });
  return { ...f, emmas, sundays };
}

type Client = Awaited<ReturnType<typeof signedInUser>>;
const list = (who: Client, groupId: Id<'groups'>) =>
  who.as.query(api.advent.calendars, { groupId });

describe('calendars', () => {
  test('the other adults see every calendar with its doors and totals', async () => {
    const { dad, groupId } = await planned();
    const year = await list(dad, groupId);
    expect(year.year).toBe(2026);
    expect(year.today).toBe('2026-12-04');
    expect(year.calendars.map((c) => [c.name, c.recipients.map((r) => r.name)])).toEqual([
      [null, ['Emma']],
      ['Søndagskalender', ['Emma', 'Jonas']],
    ]);
    const emmas = year.calendars[0];
    expect(emmas.days).toHaveLength(24);
    expect(emmas.doors.map((d) => [d.number, d.title, d.status, d.price, d.note])).toEqual([
      [4, 'Eraser', 'wrapped', 29, null],
      [5, 'Pencils', 'bought', 89.5, 'Bookshop'],
    ]);
    expect(emmas.totals).toEqual({
      idea: 0,
      bought: 1,
      wrapped: 1,
      empty: 22,
      spent: 118.5,
      planned: 118.5,
    });
  });

  test('ideas count as planned, not spent', async () => {
    const { mum, groupId, sundays } = await planned();
    await mum.as.mutation(api.advent.setDoor, {
      calendarId: sundays,
      day: '2026-12-13',
      title: 'Skating',
      status: 'idea',
      price: 150,
      note: '',
    });
    const cal = (await list(mum, groupId)).calendars[1];
    expect(cal.doors.map((d) => [d.number, d.title])).toEqual([[3, 'Skating']]);
    expect(cal.totals).toMatchObject({ idea: 1, empty: 3, spent: 0, planned: 150 });
  });

  test('the members offered as recipients are everyone but the caller', async () => {
    const { dad, groupId } = await planned();
    expect((await list(dad, groupId)).members.map((m) => m.name)).toEqual([
      'Kari',
      'Emma',
      'Jonas',
    ]);
  });

  test('a door can be changed, moved through the statuses and emptied', async () => {
    const { dad, groupId, emmas } = await planned();
    await dad.as.mutation(api.advent.setDoor, {
      calendarId: emmas,
      day: '2026-12-04',
      title: 'Glitter eraser',
      status: 'wrapped',
      price: null,
      note: ' ',
    });
    await dad.as.mutation(api.advent.setDoorStatus, {
      calendarId: emmas,
      day: '2026-12-05',
      status: 'wrapped',
    });
    let doors = (await list(dad, groupId)).calendars[0].doors;
    expect(doors.map((d) => [d.title, d.status, d.price])).toEqual([
      ['Glitter eraser', 'wrapped', null],
      ['Pencils', 'wrapped', 89.5],
    ]);
    await dad.as.mutation(api.advent.clearDoor, { calendarId: emmas, day: '2026-12-04' });
    await dad.as.mutation(api.advent.clearDoor, { calendarId: emmas, day: '2026-12-04' });
    doors = (await list(dad, groupId)).calendars[0].doors;
    expect(doors.map((d) => d.title)).toEqual(['Pencils']);
    await expect(
      dad.as.mutation(api.advent.setDoorStatus, {
        calendarId: emmas,
        day: '2026-12-04',
        status: 'bought',
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('titles, prices and days are checked', async () => {
    const { mum, emmas, sundays } = await planned();
    const door = { calendarId: emmas, day: '2026-12-06', status: 'idea' as const, note: '' };
    await expect(
      mum.as.mutation(api.advent.setDoor, { ...door, title: '  ', price: null }),
    ).rejects.toThrow(/DOOR_TITLE_REQUIRED/);
    await expect(
      mum.as.mutation(api.advent.setDoor, { ...door, title: 'x', price: -1 }),
    ).rejects.toThrow(/INVALID_PRICE/);
    await expect(
      mum.as.mutation(api.advent.setDoor, {
        ...door,
        calendarId: sundays,
        day: '2026-12-07',
        title: 'Not a Sunday',
        price: null,
      }),
    ).rejects.toThrow(/INVALID_DAYS/);
  });
});

describe('creating a calendar', () => {
  test('needs days of that Advent and at least one other member', async () => {
    const { mum, emma, groupId } = await family();
    const base = { groupId, year: 2026, recipientIds: [emma.userId], days: DECEMBER };
    await expect(mum.as.mutation(api.advent.createCalendar, { ...base, days: [] })).rejects.toThrow(
      /INVALID_DAYS/,
    );
    await expect(
      mum.as.mutation(api.advent.createCalendar, { ...base, days: ['2026-12-25'] }),
    ).rejects.toThrow(/INVALID_DAYS/);
    await expect(
      mum.as.mutation(api.advent.createCalendar, { ...base, recipientIds: [] }),
    ).rejects.toThrow(/INVALID_CALENDAR_RECIPIENTS/);
    await expect(
      mum.as.mutation(api.advent.createCalendar, { ...base, year: 1999 }),
    ).rejects.toThrow(/INVALID_YEAR/);
  });

  test('November days of the first Advent Sunday are allowed', async () => {
    const { mum, emma, groupId } = await family();
    await mum.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma.userId],
      days: ['2026-12-06', '2026-11-29', '2026-12-06'],
    });
    expect((await list(mum, groupId)).calendars[0].days).toEqual(['2026-11-29', '2026-12-06']);
  });

  test('recipients must be members of the family now', async () => {
    const { mum, eve, groupId } = await family();
    await expect(
      mum.as.mutation(api.advent.createCalendar, {
        groupId,
        year: 2026,
        recipientIds: [eve.userId],
        days: DECEMBER,
      }),
    ).rejects.toThrow(/INVALID_CALENDAR_RECIPIENTS/);
  });

  test('making a calendar for yourself is refused before anything is looked up', async () => {
    const { mum, emma, groupId, otherGroupId } = await family();
    for (const gid of [groupId, otherGroupId]) {
      await expect(
        mum.as.mutation(api.advent.createCalendar, {
          groupId: gid,
          year: 2026,
          recipientIds: [mum.userId, emma.userId],
          days: DECEMBER,
        }),
      ).rejects.toThrow(/RECIPIENT_IS_YOU/);
    }
  });
});

describe('hiding from the recipients', () => {
  test('a recipient never sees their calendars', async () => {
    const { emma, jonas, groupId } = await planned();
    expect((await list(emma, groupId)).calendars).toEqual([]);
    expect((await list(jonas, groupId)).calendars.map((c) => c.name)).toEqual([null]);
  });

  test('a hidden calendar fails exactly like a missing one', async () => {
    const { mum, emma, groupId, emmas } = await planned();
    const gone = await mum.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma.userId],
      days: DECEMBER,
    });
    await mum.as.mutation(api.advent.removeCalendar, { calendarId: gone });
    for (const calendarId of [emmas, gone]) {
      const calls = [
        emma.as.mutation(api.advent.setDoor, {
          calendarId,
          day: '2026-12-04',
          title: 'x',
          status: 'idea',
          price: null,
          note: '',
        }),
        emma.as.mutation(api.advent.setDoorStatus, {
          calendarId,
          day: '2026-12-04',
          status: 'idea',
        }),
        emma.as.mutation(api.advent.clearDoor, { calendarId, day: '2026-12-04' }),
        emma.as.mutation(api.advent.renameCalendar, { calendarId, name: 'x' }),
        emma.as.mutation(api.advent.setDays, { calendarId, days: DECEMBER }),
        emma.as.mutation(api.advent.removeCalendar, { calendarId }),
      ];
      for (const call of calls) await expect(call).rejects.toThrow(/NOT_FOUND/);
    }
  });

  test('adding someone as a recipient hides the calendar from them at once', async () => {
    const { mum, dad, emma, groupId, emmas } = await planned();
    await mum.as.mutation(api.advent.setRecipients, {
      calendarId: emmas,
      recipientIds: [emma.userId, dad.userId],
    });
    expect((await list(dad, groupId)).calendars.map((c) => c.name)).toEqual(['Søndagskalender']);
    await mum.as.mutation(api.advent.setRecipients, {
      calendarId: emmas,
      recipientIds: [emma.userId],
    });
    expect((await list(dad, groupId)).calendars).toHaveLength(2);
  });

  test('adding yourself is refused the same way for any calendar', async () => {
    const { mum, emma, emmas } = await planned();
    await expect(
      emma.as.mutation(api.advent.setRecipients, {
        calendarId: emmas,
        recipientIds: [emma.userId],
      }),
    ).rejects.toThrow(/RECIPIENT_IS_YOU/);
    await expect(
      mum.as.mutation(api.advent.setRecipients, {
        calendarId: emmas,
        recipientIds: [mum.userId],
      }),
    ).rejects.toThrow(/RECIPIENT_IS_YOU/);
  });

  test('a recipient who leaves and rejoins still sees nothing', async () => {
    const { t, emma, groupId } = await planned();
    await emma.as.mutation(api.groups.leave, { groupId });
    await t.run(async (ctx) => {
      await ctx.db.insert('memberships', {
        groupId,
        userId: emma.userId,
        role: 'member',
        joinedAt: Date.now(),
      });
    });
    expect((await list(emma, groupId)).calendars).toEqual([]);
    expect(await emma.as.query(api.advent.weekCard, { groupId })).toBeNull();
  });
});

describe('days', () => {
  test('removing a day with something behind its door must name that day', async () => {
    const { mum, groupId, emmas } = await planned();
    const fewer = DECEMBER.filter((d) => d !== '2026-12-05');
    await expect(
      mum.as.mutation(api.advent.setDays, { calendarId: emmas, days: fewer }),
    ).rejects.toThrow(/DAYS_HAVE_DOORS/);
    // Agreeing to lose a different door (one filled meanwhile, unseen) is refused too.
    await expect(
      mum.as.mutation(api.advent.setDays, { calendarId: emmas, days: fewer, drop: ['2026-12-06'] }),
    ).rejects.toThrow(/DAYS_HAVE_DOORS/);
    await mum.as.mutation(api.advent.setDays, {
      calendarId: emmas,
      days: fewer,
      drop: ['2026-12-05'],
    });
    const cal = (await list(mum, groupId)).calendars[0];
    expect(cal.days).toHaveLength(23);
    expect(cal.doors.map((d) => d.title)).toEqual(['Eraser']);
    // Empty days go without asking; door numbers follow the place once it isn't 1-24 Dec.
    await mum.as.mutation(api.advent.setDays, {
      calendarId: emmas,
      days: ['2026-11-29', '2026-12-04'],
    });
    const short = (await list(mum, groupId)).calendars[0];
    expect(short.doors.map((d) => [d.day, d.number])).toEqual([['2026-12-04', 2]]);
  });
});

describe('doors', () => {
  test('a door can only be emptied on one of the calendar’s days', async () => {
    const { mum, sundays } = await planned();
    await expect(
      mum.as.mutation(api.advent.clearDoor, { calendarId: sundays, day: '2026-12-25' }),
    ).rejects.toThrow(/INVALID_DAYS/);
  });
});

describe('a recipient who left the family', () => {
  test('stays on the calendar while the others change its recipients', async () => {
    const { mum, dad, emma, jonas, groupId, sundays } = await planned();
    await emma.as.mutation(api.groups.leave, { groupId });
    await mum.as.mutation(api.advent.setRecipients, {
      calendarId: sundays,
      recipientIds: [emma.userId, jonas.userId, dad.userId],
    });
    expect(
      (await list(mum, groupId)).calendars
        .find((c) => c._id === sundays)!
        .recipients.map((r) => r.name),
    ).toEqual(['Emma', 'Jonas', 'Ola']);
    // Once taken off, someone outside the family can't be put back.
    await mum.as.mutation(api.advent.setRecipients, {
      calendarId: sundays,
      recipientIds: [jonas.userId],
    });
    await expect(
      mum.as.mutation(api.advent.setRecipients, {
        calendarId: sundays,
        recipientIds: [jonas.userId, emma.userId],
      }),
    ).rejects.toThrow(/INVALID_CALENDAR_RECIPIENTS/);
  });
});

describe('managing calendars', () => {
  test('rename, back to the recipients’ names, and delete', async () => {
    const { mum, dad, groupId, emmas } = await planned();
    await dad.as.mutation(api.advent.renameCalendar, { calendarId: emmas, name: 'Emmas' });
    expect((await list(mum, groupId)).calendars[0].name).toBe('Emmas');
    await dad.as.mutation(api.advent.renameCalendar, { calendarId: emmas, name: ' ' });
    expect((await list(mum, groupId)).calendars[0].name).toBeNull();
    await dad.as.mutation(api.advent.removeCalendar, { calendarId: emmas });
    expect((await list(mum, groupId)).calendars.map((c) => c.name)).toEqual(['Søndagskalender']);
  });

  test('calendars belong to a year', async () => {
    const { mum, emma, groupId } = await planned();
    await mum.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2025,
      recipientIds: [emma.userId],
      days: templateDays(2025, 'sundays'),
    });
    const last = await mum.as.query(api.advent.calendars, { groupId, year: 2025 });
    expect(last.year).toBe(2025);
    expect(last.currentYear).toBe(2026);
    expect(last.calendars.map((c) => c.days[0])).toEqual(['2025-11-30']);
    expect((await list(mum, groupId)).calendars).toHaveLength(2);
  });
});

describe('the Week card', () => {
  test('shows today and tomorrow, or the next door, for each visible calendar', async () => {
    const { dad, groupId } = await planned();
    const card = (await dad.as.query(api.advent.weekCard, { groupId }))!;
    expect(card.today).toBe('2026-12-04');
    expect(
      card.calendars.map((c) => [c.name, c.today?.title, c.tomorrow?.status, c.next?.number]),
    ).toEqual([
      [null, 'Eraser', 'bought', undefined],
      ['Søndagskalender', undefined, undefined, 2],
    ]);
  });

  test('is null for a recipient of every calendar, and outside Advent', async () => {
    const { emma, dad, groupId } = await planned();
    expect(await emma.as.query(api.advent.weekCard, { groupId })).toBeNull();
    vi.setSystemTime(new Date('2026-12-26T12:00:00Z'));
    expect(await dad.as.query(api.advent.weekCard, { groupId })).toBeNull();
  });
});

describe('other families', () => {
  test('can neither see nor change anything', async () => {
    const { eve, groupId, emmas } = await planned();
    await expect(eve.as.query(api.advent.calendars, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.query(api.advent.weekCard, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.advent.createCalendar, {
        groupId,
        year: 2026,
        recipientIds: [],
        days: DECEMBER,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
    const calls = [
      eve.as.mutation(api.advent.renameCalendar, { calendarId: emmas, name: 'x' }),
      eve.as.mutation(api.advent.setRecipients, { calendarId: emmas, recipientIds: [] }),
      eve.as.mutation(api.advent.setDays, { calendarId: emmas, days: DECEMBER }),
      eve.as.mutation(api.advent.removeCalendar, { calendarId: emmas }),
      eve.as.mutation(api.advent.clearDoor, { calendarId: emmas, day: '2026-12-04' }),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(/NOT_FOUND/);
  });

  test('signed out callers are refused first', async () => {
    const { t, emmas } = await planned();
    await expect(t.mutation(api.advent.removeCalendar, { calendarId: emmas })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });
});

describe('clean-up', () => {
  test('a deleted account leaves its calendars, and one only for them goes', async () => {
    const { t, mum, emma, groupId } = await planned();
    await emma.as.mutation(api.account.deleteAccount, {});
    const left = (await list(mum, groupId)).calendars;
    expect(left.map((c) => [c.name, c.recipients.map((r) => r.name)])).toEqual([
      ['Søndagskalender', ['Jonas']],
    ]);
    const doors = await t.run((ctx) => ctx.db.query('adventDoors').collect());
    expect(doors).toEqual([]);
  });

  test('also in a family they left earlier', async () => {
    const { t, emma, groupId } = await planned();
    await emma.as.mutation(api.groups.leave, { groupId });
    await emma.as.mutation(api.account.deleteAccount, {});
    const rows = await t.run((ctx) => ctx.db.query('adventRecipients').collect());
    expect(rows.map((r) => r.userId)).not.toContain(emma.userId);
  });

  test('a deleted family takes its calendars with it', async () => {
    const { t, mum, dad, emma, jonas, groupId } = await planned();
    for (const who of [mum, dad, emma, jonas]) await who.as.mutation(api.groups.leave, { groupId });
    const left = await t.run(async (ctx) => [
      ...(await ctx.db.query('adventCalendars').collect()),
      ...(await ctx.db.query('adventRecipients').collect()),
      ...(await ctx.db.query('adventDoors').collect()),
    ]);
    expect(left).toEqual([]);
  });
});
