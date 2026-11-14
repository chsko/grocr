import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';

// Gifts are hidden from the member they are for (ADR 0002). Most tests here check that the
// linked member sees nothing about their recipient, not even in totals or error codes.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'ada');
  const bob = await signedInUser(t, 'bob');
  const kid = await signedInUser(t, 'kid');
  const eve = await signedInUser(t, 'eve');
  const groupId = await groupWithMembers(t, [ada.userId, bob.userId, kid.userId]);
  const otherGroupId = await groupWithMembers(t, [eve.userId]);
  return { t, ada, bob, kid, eve, groupId, otherGroupId };
}

/** Ada plans a watch for Bob (linked) and a scarf for Granny (not a member). */
async function planned() {
  const f = await family();
  const { ada, bob, groupId } = f;
  const bobR = await ada.as.mutation(api.gifts.addRecipient, {
    groupId,
    name: 'Bob',
    memberUserId: bob.userId,
  });
  const granny = await ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'Granny' });
  const watch = await ada.as.mutation(api.gifts.addGift, {
    recipientId: bobR,
    title: 'Watch',
    year: 2026,
  });
  const scarf = await ada.as.mutation(api.gifts.addGift, {
    recipientId: granny,
    title: 'Scarf',
    year: 2026,
  });
  return { ...f, bobR, granny, watch, scarf };
}

const names = (xmas: { recipients: { name: string }[] }) => xmas.recipients.map((r) => r.name);

describe('one gift list', () => {
  test('the family sees this Christmas grouped by recipient', async () => {
    const { kid, groupId } = await planned();
    const xmas = await kid.as.query(api.gifts.christmas, { groupId });
    expect(xmas.year).toBe(2026);
    expect(xmas.recipients.map((r) => [r.name, r.linkedName, r.gifts.map((g) => g.title)])).toEqual(
      [
        ['Bob', 'bob', ['Watch']],
        ['Granny', null, ['Scarf']],
      ],
    );
  });

  test('recipients added mid-Christmas join it without gifts', async () => {
    const { ada, groupId } = await planned();
    await ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'Uncle' });
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(names(xmas)).toEqual(['Bob', 'Granny', 'Uncle']);
    expect(xmas.recipients[2].gifts).toEqual([]);
  });

  test('titles and names are required and trimmed', async () => {
    const { ada, groupId, granny } = await planned();
    await expect(ada.as.mutation(api.gifts.addRecipient, { groupId, name: '  ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
    await expect(
      ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: ' ', year: 2026 }),
    ).rejects.toThrow(/GIFT_TITLE_REQUIRED/);
    await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: '  Tea  ', year: 2026 });
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1].gifts.map((g) => g.title)).toEqual(['Scarf', 'Tea']);
  });
});

describe('hiding from the linked member', () => {
  test('the linked member never sees their recipient or its gifts', async () => {
    const { bob, groupId, bobR, watch } = await planned();
    expect(names(await bob.as.query(api.gifts.christmas, { groupId }))).toEqual(['Granny']);
    const list = await bob.as.query(api.gifts.recipients, { groupId });
    expect(list.recipients.map((r) => r.name)).toEqual(['Granny']);
    // Bob is not offered as a link, so he can't learn whether he is linked.
    expect(list.members.map((m) => m.name)).toEqual(['ada', 'kid']);

    const refusals = [
      bob.as.mutation(api.gifts.linkRecipient, { recipientId: bobR, memberUserId: null }),
      bob.as.mutation(api.gifts.addGift, { recipientId: bobR, title: 'x', year: 2026 }),
    ];
    for (const refusal of refusals) await expect(refusal).rejects.toThrow(/NOT_FOUND/);
    expect(watch).toBeDefined();
  });

  test('children follow the same rule', async () => {
    const { ada, kid, groupId } = await planned();
    const kidR = await ada.as.mutation(api.gifts.addRecipient, {
      groupId,
      name: 'Kid',
      memberUserId: kid.userId,
    });
    await ada.as.mutation(api.gifts.addGift, { recipientId: kidR, title: 'Bike', year: 2026 });
    expect(names(await kid.as.query(api.gifts.christmas, { groupId }))).toEqual(['Bob', 'Granny']);
  });

  test('linking hides at once and unlinking shows again', async () => {
    const { ada, kid, groupId, granny } = await planned();
    await ada.as.mutation(api.gifts.linkRecipient, {
      recipientId: granny,
      memberUserId: kid.userId,
    });
    expect(names(await kid.as.query(api.gifts.christmas, { groupId }))).toEqual(['Bob']);
    await ada.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: null });
    expect(names(await kid.as.query(api.gifts.christmas, { groupId }))).toEqual(['Bob', 'Granny']);
  });

  test('linking yourself is refused before anything is looked up', async () => {
    const { ada, bob, groupId, granny } = await planned();
    // Bob is already linked; the answer must be the same as for a member who isn't.
    await expect(
      bob.as.mutation(api.gifts.addRecipient, { groupId, name: 'Me', memberUserId: bob.userId }),
    ).rejects.toThrow(/CANNOT_LINK_SELF/);
    await expect(
      ada.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: ada.userId }),
    ).rejects.toThrow(/CANNOT_LINK_SELF/);
  });

  test('a member is linked to at most one recipient, and only members can be linked', async () => {
    const { ada, bob, eve, groupId, granny } = await planned();
    await expect(
      ada.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: bob.userId }),
    ).rejects.toThrow(/ALREADY_LINKED/);
    await expect(
      ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'B', memberUserId: bob.userId }),
    ).rejects.toThrow(/ALREADY_LINKED/);
    await expect(
      ada.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: eve.userId }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('the recipients screen says which members are linked', async () => {
    const { ada, groupId } = await planned();
    const list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.recipients.map((r) => [r.name, r.linkedName])).toEqual([
      ['Bob', 'bob'],
      ['Granny', null],
    ]);
    expect(list.members.map((m) => [m.name, m.linked])).toEqual([
      ['bob', true],
      ['kid', false],
    ]);
  });
});

describe('other families', () => {
  test('can neither see nor change anything', async () => {
    const { eve, groupId, granny } = await planned();
    await expect(eve.as.query(api.gifts.christmas, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.query(api.gifts.recipients, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.mutation(api.gifts.addRecipient, { groupId, name: 'x' })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      eve.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'x', year: 2026 }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: null }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('gift status', () => {
  test('moves a gift on and counts it, for every member but the linked one', async () => {
    const { ada, bob, kid, groupId, watch, scarf } = await planned();
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: watch, status: 'bought' });
    await kid.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'wrapped' });
    // Setting the same status again changes nothing.
    await kid.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'wrapped' });

    const xmas = await kid.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => [r.name, r.counts])).toEqual([
      ['Bob', { idea: 0, bought: 1, wrapped: 0 }],
      ['Granny', { idea: 0, bought: 0, wrapped: 1 }],
    ]);
    expect(xmas.totals).toMatchObject({ idea: 0, bought: 1, wrapped: 1 });
    expect(xmas.recipients[0].gifts[0].status).toBe('bought');

    // Bob's own watch is not in his totals.
    const his = await bob.as.query(api.gifts.christmas, { groupId });
    expect(his.totals).toMatchObject({ idea: 0, bought: 0, wrapped: 1 });
    await expect(
      bob.as.mutation(api.gifts.setGiftStatus, { giftId: watch, status: 'idea' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('another family cannot change it', async () => {
    const { eve, scarf } = await planned();
    await expect(
      eve.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'bought' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('gift details', () => {
  test('saves price, link, note and buyer, and shows them in the list', async () => {
    const { ada, kid, groupId, scarf } = await planned();
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: ' Wool scarf ',
      price: 299.999,
      url: 'example.com/scarf',
      note: '  Size M ',
      buyerUserId: kid.userId,
    });
    const sheet = await kid.as.query(api.gifts.gift, { giftId: scarf });
    expect(sheet).toMatchObject({
      title: 'Wool scarf',
      price: 300,
      url: 'https://example.com/scarf',
      note: 'Size M',
      buyerUserId: kid.userId,
      buyerName: 'kid',
      recipientName: 'Granny',
      status: 'idea',
    });
    expect(sheet!.buyers.map((b) => b.name)).toEqual(['ada', 'bob', 'kid']);
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1].gifts[0]).toMatchObject({
      price: 300,
      buyerName: 'kid',
      url: 'https://example.com/scarf',
    });

    // Clearing works by sending empty values.
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: 'Wool scarf',
      price: null,
      url: '',
      note: '',
      buyerUserId: null,
    });
    expect(await ada.as.query(api.gifts.gift, { giftId: scarf })).toMatchObject({
      price: null,
      url: null,
      note: null,
      buyerUserId: null,
    });
  });

  test('refuses bad prices and links', async () => {
    const { ada, scarf } = await planned();
    const base = { giftId: scarf, title: 'Scarf', url: '', note: '', buyerUserId: null };
    await expect(ada.as.mutation(api.gifts.updateGift, { ...base, price: -1 })).rejects.toThrow(
      /INVALID_PRICE/,
    );
    await expect(
      ada.as.mutation(api.gifts.updateGift, { ...base, price: 20_000_000 }),
    ).rejects.toThrow(/INVALID_PRICE/);
    await expect(
      ada.as.mutation(api.gifts.updateGift, { ...base, price: null, url: 'javascript:alert(1)' }),
    ).rejects.toThrow(/INVALID_LINK/);
  });

  test('the recipient and outsiders cannot buy', async () => {
    const { ada, bob, eve, bobR, watch } = await planned();
    const base = { giftId: watch, title: 'Watch', price: null, url: '', note: '' };
    const sheet = await ada.as.query(api.gifts.gift, { giftId: watch });
    expect(sheet!.buyers.map((b) => b.name)).toEqual(['ada', 'kid']);
    await expect(
      ada.as.mutation(api.gifts.updateGift, { ...base, buyerUserId: bob.userId }),
    ).rejects.toThrow(/INVALID_BUYER/);
    await expect(
      ada.as.mutation(api.gifts.updateGift, { ...base, buyerUserId: eve.userId }),
    ).rejects.toThrow(/INVALID_BUYER/);
    expect(bobR).toBeDefined();
  });

  test('linking a member clears them as buyer of that recipient’s gifts', async () => {
    const { ada, kid, granny, scarf } = await planned();
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: 'Scarf',
      price: null,
      url: '',
      note: '',
      buyerUserId: kid.userId,
    });
    await ada.as.mutation(api.gifts.linkRecipient, {
      recipientId: granny,
      memberUserId: kid.userId,
    });
    expect(await ada.as.query(api.gifts.gift, { giftId: scarf })).toMatchObject({
      buyerUserId: null,
    });
  });

  test('hidden and deleted gifts look the same: null to read, NOT_FOUND to change', async () => {
    const { ada, bob, eve, watch, scarf } = await planned();
    expect(await bob.as.query(api.gifts.gift, { giftId: watch })).toBeNull();
    expect(await eve.as.query(api.gifts.gift, { giftId: scarf })).toBeNull();
    const edit = { title: 'x', price: null, url: '', note: '', buyerUserId: null };
    await expect(bob.as.mutation(api.gifts.updateGift, { giftId: watch, ...edit })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(bob.as.mutation(api.gifts.removeGift, { giftId: watch })).rejects.toThrow(
      /NOT_FOUND/,
    );

    await ada.as.mutation(api.gifts.removeGift, { giftId: scarf });
    expect(await ada.as.query(api.gifts.gift, { giftId: scarf })).toBeNull();
    await expect(ada.as.mutation(api.gifts.updateGift, { giftId: scarf, ...edit })).rejects.toThrow(
      /NOT_FOUND/,
    );
  });
});
