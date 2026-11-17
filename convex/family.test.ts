import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { templateDays } from './lib/advent';
import { groupWithMembers, setup, signedInUser } from './test.setup';

// Family members without the app (#95, ADR 0004). The thing that must hold: whatever is planned
// for a child without the app is hidden from them from the moment they join with their invite.

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
  const kari = await signedInUser(t, 'Kari');
  const ola = await signedInUser(t, 'Ola');
  const eve = await signedInUser(t, 'Eve');
  const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
  const otherGroupId = await groupWithMembers(t, [eve.userId]);
  const emma = await ola.as.mutation(api.family.addPerson, { groupId, name: ' Emma ' });
  return { t, kari, ola, eve, groupId, otherGroupId, emma };
}

async function emmaRecipient(f: Awaited<ReturnType<typeof family>>) {
  const xmas = await f.kari.as.query(api.gifts.christmas, { groupId: f.groupId });
  return xmas.recipients.find((r) => r.name === 'Emma')!;
}

describe('family members without the app', () => {
  test('any member adds one; everyone in the family sees them', async () => {
    const { kari, ola, groupId, emma } = await family();
    expect(await kari.as.query(api.family.people, { groupId })).toEqual([
      { _id: emma, name: 'Emma', createdAt: expect.any(Number) },
    ]);
    expect(await ola.as.query(api.family.people, { groupId })).toHaveLength(1);
  });

  test('another family sees and changes nothing', async () => {
    const { eve, groupId, otherGroupId, emma } = await family();
    await expect(eve.as.query(api.family.people, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.mutation(api.family.addPerson, { groupId, name: 'X' })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      eve.as.mutation(api.family.renamePerson, { familyMemberId: emma, name: 'X' }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.family.removePerson, { familyMemberId: emma }),
    ).rejects.toThrow(/NOT_FOUND/);
    expect(await eve.as.query(api.family.people, { groupId: otherGroupId })).toEqual([]);
  });

  test('a name is required, and renaming renames their gift recipient too', async () => {
    const f = await family();
    const { kari, ola, groupId, emma } = f;
    await expect(ola.as.mutation(api.family.addPerson, { groupId, name: '  ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
    await ola.as.mutation(api.family.renamePerson, { familyMemberId: emma, name: 'Emma H' });
    expect((await kari.as.query(api.family.people, { groupId }))[0].name).toBe('Emma H');
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => [r.name, r.inFamily, r.withoutApp])).toEqual([
      ['Emma H', true, true],
    ]);
    // And the other way round, from the gift list.
    await kari.as.mutation(api.gifts.renameRecipient, {
      recipientId: xmas.recipients[0]._id,
      name: 'Em',
    });
    expect((await kari.as.query(api.family.people, { groupId }))[0].name).toBe('Em');
  });

  test('only the owner removes one; their gifts stay with a plain person', async () => {
    const f = await family();
    const { kari, ola, groupId, emma } = f;
    const recipient = await emmaRecipient(f);
    await kari.as.mutation(api.gifts.addGift, {
      recipientId: recipient._id,
      title: 'Bike',
      year: 2026,
    });
    await expect(
      ola.as.mutation(api.family.removePerson, { familyMemberId: emma }),
    ).rejects.toThrow(/FORBIDDEN/);
    await kari.as.mutation(api.family.removePerson, { familyMemberId: emma });
    expect(await kari.as.query(api.family.people, { groupId })).toEqual([]);
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => [r.name, r.inFamily, r.gifts.length])).toEqual([
      ['Emma', false, 1],
    ]);
    expect(xmas.family).toBeNull();
  });

  test('a family recipient is not deleted from the gift list or linked by hand', async () => {
    const f = await family();
    const recipient = await emmaRecipient(f);
    await expect(
      f.kari.as.mutation(api.gifts.removeRecipient, { recipientId: recipient._id }),
    ).rejects.toThrow(/IN_FAMILY/);
    await expect(
      f.kari.as.mutation(api.gifts.linkRecipient, {
        recipientId: recipient._id,
        memberUserId: f.ola.userId,
      }),
    ).rejects.toThrow(/IN_FAMILY/);
  });

  test('a plain person moves into the family with their gifts', async () => {
    const { kari, groupId } = await family();
    const tor = await kari.as.mutation(api.gifts.addRecipient, { groupId, name: 'Tor' });
    await kari.as.mutation(api.gifts.addGift, { recipientId: tor, title: 'Kite', year: 2026 });
    const kids = await kari.as.mutation(api.gifts.addGiftGroup, { groupId, name: 'Kids' });
    await kari.as.mutation(api.gifts.setRecipientGroup, { recipientId: tor, giftGroupId: kids });
    await kari.as.mutation(api.gifts.moveRecipientToFamily, { recipientId: tor });
    expect((await kari.as.query(api.family.people, { groupId })).map((p) => p.name)).toEqual([
      'Emma',
      'Tor',
    ]);
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    const row = xmas.recipients.find((r) => r._id === tor)!;
    expect([row.inFamily, row.giftGroupId, row.gifts.length]).toEqual([true, null, 1]);
    await expect(
      kari.as.mutation(api.gifts.moveRecipientToFamily, { recipientId: tor }),
    ).rejects.toThrow(/CANNOT_MOVE_TO_FAMILY/);
  });

  test('a member gets a gift recipient when they create or join a family', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await kari.as.mutation(api.groups.create, {
      name: 'Hansen',
      timezone: 'Europe/Oslo',
    });
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    await ola.as.mutation(api.invites.accept, { code });
    const kariSees = await kari.as.query(api.gifts.christmas, { groupId });
    expect(kariSees.recipients.map((r) => [r.name, r.inFamily])).toEqual([['Ola', true]]);
    const olaSees = await ola.as.query(api.gifts.christmas, { groupId });
    expect(olaSees.recipients.map((r) => [r.name, r.inFamily])).toEqual([['Kari', true]]);
  });

  test('the backfill gives every existing member a recipient, once', async () => {
    const { t, kari, groupId } = await family();
    expect(await t.mutation(internal.family.backfillRecipients, {})).toEqual({ made: 3 });
    expect(await t.mutation(internal.family.backfillRecipients, {})).toEqual({ made: 0 });
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => r.name)).toEqual(['Emma', 'Ola']);
  });

  test('linking a recipient by hand replaces the empty one a member got', async () => {
    const { t, kari, ola, groupId } = await family();
    await t.mutation(internal.family.backfillRecipients, {});
    const olaR = await kari.as.mutation(api.gifts.addRecipient, {
      groupId,
      name: 'Pappa',
      memberUserId: ola.userId,
    });
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.filter((r) => r.inFamily && !r.withoutApp).map((r) => r._id)).toEqual([
      olaR,
    ]);
  });
});

describe('Advent calendars for family members without the app', () => {
  test('a calendar can be for them, and the picker offers them', async () => {
    const { kari, groupId, emma } = await family();
    const data = await kari.as.query(api.advent.calendars, { groupId, year: 2026 });
    expect(data.members.map((m) => [m.name, m.withoutApp])).toEqual([
      ['Ola', false],
      ['Emma', true],
    ]);
    await kari.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma],
      days: SUNDAYS,
    });
    const after = await kari.as.query(api.advent.calendars, { groupId, year: 2026 });
    expect(after.calendars[0].recipients).toEqual([
      { id: emma, userId: emma, withoutApp: true, name: 'Emma' },
    ]);
  });

  test("another family's person can't be a recipient", async () => {
    const { t, eve, otherGroupId, groupId, kari } = await family();
    const theirs = await t.run((ctx) =>
      ctx.db.insert('familyMembers', { groupId: otherGroupId, name: 'Tor', createdAt: 0 }),
    );
    await expect(
      kari.as.mutation(api.advent.createCalendar, {
        groupId,
        year: 2026,
        recipientIds: [theirs],
        days: SUNDAYS,
      }),
    ).rejects.toThrow(/INVALID_CALENDAR_RECIPIENTS/);
    expect(eve).toBeDefined();
  });

  test('removing them takes them off calendars; a calendar left with no one is deleted', async () => {
    const { kari, ola, groupId, emma } = await family();
    const both = await kari.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma, ola.userId],
      days: SUNDAYS,
    });
    await kari.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma],
      days: SUNDAYS,
    });
    await kari.as.mutation(api.family.removePerson, { familyMemberId: emma });
    const left = await kari.as.query(api.advent.calendars, { groupId, year: 2026 });
    expect(left.calendars.map((c) => [c._id, c.recipients.map((r) => r.name)])).toEqual([
      [both, ['Ola']],
    ]);
  });
});

describe('inviting a family member without the app', () => {
  async function invited() {
    const f = await family();
    const { t, kari, groupId, emma } = f;
    const recipient = await emmaRecipient(f);
    const bike = await kari.as.mutation(api.gifts.addGift, {
      recipientId: recipient._id,
      title: 'Bike',
      year: 2026,
    });
    const tor = await kari.as.mutation(api.family.addPerson, { groupId, name: 'Tor' });
    const torR = (await kari.as.query(api.gifts.christmas, { groupId })).recipients.find(
      (r) => r.name === 'Tor',
    )!;
    const joint = await kari.as.mutation(api.gifts.addGift, {
      recipientId: torR._id,
      title: 'Trampoline',
      year: 2026,
    });
    await kari.as.mutation(api.gifts.setGiftRecipients, {
      giftId: joint,
      recipientIds: [torR._id, recipient._id],
    });
    const calendar = await kari.as.mutation(api.advent.createCalendar, {
      groupId,
      year: 2026,
      recipientIds: [emma],
      days: SUNDAYS,
    });
    const { code } = await kari.as.mutation(api.invites.create, { groupId, familyMemberId: emma });
    const emmaUser = await signedInUser(t, 'Emma Hansen');
    return { ...f, emmaUser, code, bike, joint, calendar, tor, recipient };
  }

  test('the code says who you join as', async () => {
    const { emmaUser, code } = await invited();
    expect(await emmaUser.as.mutation(api.invites.preview, { code })).toMatchObject({
      status: 'ok',
      personName: 'Emma',
    });
  });

  test('joining makes you them: their gifts, joint gifts and calendars are hidden at once', async () => {
    const { emmaUser, code, groupId, kari, bike, joint, calendar, recipient } = await invited();
    expect(await emmaUser.as.mutation(api.invites.accept, { code })).toMatchObject({
      status: 'ok',
    });
    expect(await kari.as.query(api.family.people, { groupId })).toHaveLength(1);

    const hers = await emmaUser.as.query(api.gifts.christmas, { groupId });
    expect(hers.recipients.map((r) => r.name)).toEqual(['Tor']);
    expect(hers.recipients.flatMap((r) => r.gifts.map((g) => g.title))).toEqual([]);
    expect(await emmaUser.as.query(api.gifts.gift, { giftId: bike })).toBeNull();
    expect(await emmaUser.as.query(api.gifts.gift, { giftId: joint })).toBeNull();
    expect(
      (await emmaUser.as.query(api.advent.calendars, { groupId, year: 2026 })).calendars,
    ).toEqual([]);
    await expect(
      emmaUser.as.mutation(api.advent.renameCalendar, { calendarId: calendar, name: 'Mine' }),
    ).rejects.toThrow(/NOT_FOUND/);

    // The others still see it all, with Emma now a member in Familien.
    const kariSees = await kari.as.query(api.gifts.christmas, { groupId });
    expect(kariSees.recipients.find((r) => r._id === recipient._id)).toMatchObject({
      inFamily: true,
      withoutApp: false,
      linkedName: 'Emma Hansen',
    });
    expect(
      (await kari.as.query(api.advent.calendars, { groupId, year: 2026 })).calendars,
    ).toHaveLength(1);
  });

  test('a code works once, only for that person, and not after they are removed', async () => {
    const { t, emmaUser, code, kari, groupId, tor } = await invited();
    await emmaUser.as.mutation(api.invites.accept, { code });
    const other = await signedInUser(t, 'Other');
    expect(await other.as.mutation(api.invites.accept, { code })).toEqual({ status: 'invalid' });

    const torCode = (await kari.as.mutation(api.invites.create, { groupId, familyMemberId: tor }))
      .code;
    await kari.as.mutation(api.family.removePerson, { familyMemberId: tor });
    expect(await other.as.mutation(api.invites.accept, { code: torCode })).toEqual({
      status: 'invalid',
    });
  });

  test('only the owner makes a code for a person, and only for one in their family', async () => {
    const { ola, kari, groupId, otherGroupId, t, emma } = await invited();
    await expect(
      ola.as.mutation(api.invites.create, { groupId, familyMemberId: emma }),
    ).rejects.toThrow(/FORBIDDEN/);
    const theirs = await t.run((ctx) =>
      ctx.db.insert('familyMembers', { groupId: otherGroupId, name: 'Tor', createdAt: 0 }),
    );
    await expect(
      kari.as.mutation(api.invites.create, { groupId, familyMemberId: theirs }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("a person's code and the family code don't revoke each other", async () => {
    const { kari, groupId, emma, code } = await invited();
    const general = await kari.as.mutation(api.invites.create, { groupId });
    expect((await kari.as.query(api.invites.active, { groupId }))?.code).toBe(general.code);
    expect((await kari.as.query(api.invites.active, { groupId, familyMemberId: emma }))?.code).toBe(
      code,
    );
    expect(await kari.as.query(api.invites.forPeople, { groupId })).toMatchObject([
      { familyMemberId: emma, code },
    ]);
  });

  test('deleting the account afterwards leaves a plain person and no calendar for no one', async () => {
    const { emmaUser, code, groupId, kari } = await invited();
    await emmaUser.as.mutation(api.invites.accept, { code });
    await emmaUser.as.mutation(api.account.deleteAccount, {});
    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.find((r) => r.name === 'Emma')).toMatchObject({
      inFamily: false,
      withoutApp: false,
    });
    expect((await kari.as.query(api.advent.calendars, { groupId, year: 2026 })).calendars).toEqual(
      [],
    );
  });
});

describe('linking by hand after #95', () => {
  test('a look-alike from before is suggested, and linking merges the automatic one into it', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola Hansen');
    const groupId = await kari.as.mutation(api.groups.create, {
      name: 'Hansen',
      timezone: 'Europe/Oslo',
    });
    // Ola was a plain person with a gift before he joined.
    const old = await kari.as.mutation(api.gifts.addRecipient, { groupId, name: 'Ola' });
    await kari.as.mutation(api.gifts.addGift, { recipientId: old, title: 'Hat', year: 2026 });
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    await ola.as.mutation(api.invites.accept, { code });
    // His automatic recipient got a gift too, and a budget.
    const auto = (await kari.as.query(api.gifts.christmas, { groupId })).recipients.find(
      (r) => r._id !== old,
    )!;
    await kari.as.mutation(api.gifts.addGift, { recipientId: auto._id, title: 'Book', year: 2026 });
    await kari.as.mutation(api.gifts.setBudget, { recipientId: auto._id, year: 2026, amount: 300 });

    const data = await kari.as.query(api.gifts.recipients, { groupId });
    expect(data.members).toMatchObject([{ userId: ola.userId, linked: true, match: old }]);
    await kari.as.mutation(api.gifts.linkRecipient, { recipientId: old, memberUserId: ola.userId });

    const xmas = await kari.as.query(api.gifts.christmas, { groupId });
    expect(
      xmas.recipients.map((r) => [r._id, r.inFamily, r.budget, r.gifts.map((g) => g.title)]),
    ).toEqual([[old, true, 300, ['Hat', 'Book']]]);
    const his = await ola.as.query(api.gifts.christmas, { groupId });
    expect(his.recipients.map((r) => r.name)).toEqual(['Kari']);
  });
});
