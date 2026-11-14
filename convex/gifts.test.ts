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

describe('budgets', () => {
  async function priced() {
    const f = await planned();
    const { ada, watch, scarf, granny } = f;
    const edit = { url: '', note: '', buyerUserId: null };
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: watch,
      title: 'Watch',
      price: 1500,
      ...edit,
    });
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: 'Scarf',
      price: 300,
      ...edit,
    });
    const tea = await ada.as.mutation(api.gifts.addGift, {
      recipientId: granny,
      title: 'Tea',
      year: 2026,
    });
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: tea,
      title: 'Tea',
      price: 99.5,
      ...edit,
    });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'bought' });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: watch, status: 'wrapped' });
    return { ...f, tea };
  }

  test('spent counts bought and wrapped gifts; priced ideas are planned', async () => {
    const { ada, groupId, granny, bobR } = await priced();
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 500 });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: bobR, year: 2026, amount: 1000 });
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => [r.name, r.budget, r.spent, r.planned])).toEqual([
      ['Bob', 1000, 1500, 0],
      ['Granny', 500, 300, 99.5],
    ]);
    expect(xmas.totals).toMatchObject({ budget: 1500, spent: 1800, planned: 99.5 });
  });

  test('totals never include the linked member’s own recipient', async () => {
    const { ada, bob, groupId, granny, bobR } = await priced();
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 500 });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: bobR, year: 2026, amount: 1000 });
    const his = await bob.as.query(api.gifts.christmas, { groupId });
    expect(his.totals).toMatchObject({ budget: 500, spent: 300, planned: 99.5 });
    await expect(
      bob.as.mutation(api.gifts.setBudget, { recipientId: bobR, year: 2026, amount: 1 }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('with no budgets the total budget is null', async () => {
    const { ada, groupId } = await priced();
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.totals.budget).toBeNull();
    expect(xmas.recipients[1].budget).toBeNull();
  });

  test('last year’s budget is offered, not copied', async () => {
    const { ada, groupId, granny } = await planned();
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2025, amount: 400 });
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1]).toMatchObject({ budget: null, lastBudget: 400 });
  });

  test('setting, changing and clearing a budget, and refusing bad amounts', async () => {
    const { ada, groupId, granny } = await planned();
    const budget = async () =>
      (await ada.as.query(api.gifts.christmas, { groupId })).recipients[1].budget;
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 500 });
    await ada.as.mutation(api.gifts.setBudget, {
      recipientId: granny,
      year: 2026,
      amount: 650.256,
    });
    expect(await budget()).toBe(650.26);
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: null });
    expect(await budget()).toBeNull();
    await expect(
      ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: -1 }),
    ).rejects.toThrow(/INVALID_PRICE/);
    await expect(
      ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 1999, amount: 1 }),
    ).rejects.toThrow(/INVALID_YEAR/);
  });
});

describe('idea bank', () => {
  test('ideas wait in the bank, grouped by recipient, and are counted in the list', async () => {
    const { ada, kid, groupId, granny, bobR } = await planned();
    await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Book' });
    await ada.as.mutation(api.gifts.addGift, { recipientId: bobR, title: 'Headphones' });
    const bank = await kid.as.query(api.gifts.ideas, { groupId });
    expect(bank.currentYear).toBe(2026);
    expect(bank.recipients.map((r) => [r.name, r.ideas.map((i) => i.title)])).toEqual([
      ['Bob', ['Headphones']],
      ['Granny', ['Book']],
    ]);
    const xmas = await kid.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => [r.name, r.bankCount, r.gifts.length])).toEqual([
      ['Bob', 1, 1],
      ['Granny', 1, 1],
    ]);
  });

  test('the linked member sees no ideas for themselves', async () => {
    const { ada, bob, groupId, bobR } = await planned();
    const idea = await ada.as.mutation(api.gifts.addGift, {
      recipientId: bobR,
      title: 'Headphones',
    });
    const bank = await bob.as.query(api.gifts.ideas, { groupId });
    expect(bank.recipients.map((r) => r.name)).toEqual(['Granny']);
    await expect(bob.as.mutation(api.gifts.moveGift, { giftId: idea, year: 2026 })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      bob.as.mutation(api.gifts.addGift, { recipientId: bobR, title: 'x' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('moving an idea in and back, where it becomes an idea again', async () => {
    const { ada, groupId, granny } = await planned();
    const book = await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Book' });
    await ada.as.mutation(api.gifts.moveGift, { giftId: book, year: 2026 });
    let xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1].gifts.map((g) => g.title)).toEqual(['Scarf', 'Book']);
    expect(xmas.recipients[1].bankCount).toBe(0);

    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: book, status: 'wrapped' });
    await ada.as.mutation(api.gifts.moveGift, { giftId: book, year: null });
    // Moving again changes nothing.
    await ada.as.mutation(api.gifts.moveGift, { giftId: book, year: null });
    xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1].gifts.map((g) => g.title)).toEqual(['Scarf']);
    const bank = await ada.as.query(api.gifts.ideas, { groupId });
    expect(bank.recipients[1].ideas).toMatchObject([{ title: 'Book', status: 'idea' }]);
    expect(await ada.as.query(api.gifts.gift, { giftId: book })).toMatchObject({ year: null });
  });

  test('marking a bank idea Bought moves it into this Christmas', async () => {
    const { ada, groupId, granny } = await planned();
    const book = await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Book' });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: book, status: 'idea' });
    expect((await ada.as.query(api.gifts.ideas, { groupId })).recipients[1].ideas).toHaveLength(1);
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: book, status: 'bought' });
    const xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients[1].gifts).toMatchObject([
      { title: 'Scarf' },
      { title: 'Book', status: 'bought' },
    ]);
    expect((await ada.as.query(api.gifts.ideas, { groupId })).recipients[1].ideas).toEqual([]);
  });

  test('ideas can be added all year, and moves need a real year', async () => {
    vi.setSystemTime(new Date('2027-07-10T12:00:00Z'));
    const { ada, groupId, granny } = await planned();
    const book = await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Book' });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: book, status: 'bought' });
    expect(await ada.as.query(api.gifts.gift, { giftId: book })).toMatchObject({ year: 2027 });
    await expect(ada.as.mutation(api.gifts.moveGift, { giftId: book, year: 3000 })).rejects.toThrow(
      /INVALID_YEAR/,
    );
    expect(groupId).toBeDefined();
  });
});

describe('earlier Christmases', () => {
  test('a past Christmas lists only recipients with gifts or a budget, and can be filled in', async () => {
    const { ada, groupId, granny, bobR } = await planned();
    let past = await ada.as.query(api.gifts.christmas, { groupId, year: 2025 });
    expect(past).toMatchObject({ year: 2025, currentYear: 2026, recipients: [] });
    expect(past.others.map((r) => r.name)).toEqual(['Bob', 'Granny']);

    await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Candles', year: 2025 });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: bobR, year: 2025, amount: 400 });
    past = await ada.as.query(api.gifts.christmas, { groupId, year: 2025 });
    expect(past.recipients.map((r) => [r.name, r.gifts.map((g) => g.title), r.budget])).toEqual([
      ['Bob', [], 400],
      ['Granny', ['Candles'], null],
    ]);
    expect(past.others).toEqual([]);
    // This Christmas is untouched, and still shows everyone.
    const now = await ada.as.query(api.gifts.christmas, { groupId });
    expect(now.recipients.map((r) => [r.name, r.gifts.length])).toEqual([
      ['Bob', 1],
      ['Granny', 1],
    ]);
    expect(now.others).toEqual([]);
  });

  test('the linked member is not among the others either', async () => {
    const { bob, groupId } = await planned();
    const past = await bob.as.query(api.gifts.christmas, { groupId, year: 2025 });
    expect(past.others.map((r) => r.name)).toEqual(['Granny']);
  });

  test('years outside 2000 to 2100 are refused', async () => {
    const { ada, groupId, granny } = await planned();
    await expect(ada.as.query(api.gifts.christmas, { groupId, year: 1999 })).rejects.toThrow(
      /INVALID_YEAR/,
    );
    await expect(
      ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'x', year: 2101 }),
    ).rejects.toThrow(/INVALID_YEAR/);
  });

  test('this Christmas switches on 1 January in the family’s timezone', async () => {
    // 23:30 in UTC on New Year's Eve is already 1 January in Oslo.
    vi.setSystemTime(new Date('2026-12-31T22:30:00Z'));
    const f = await planned();
    expect((await f.ada.as.query(api.gifts.christmas, { groupId: f.groupId })).year).toBe(2026);
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    const xmas = await f.ada.as.query(api.gifts.christmas, { groupId: f.groupId });
    expect(xmas.year).toBe(2027);
    expect(xmas.recipients.map((r) => [r.name, r.gifts.length])).toEqual([
      ['Bob', 0],
      ['Granny', 0],
    ]);
  });
});

describe('recipient lifecycle', () => {
  test('rename, archive and bring back', async () => {
    const { ada, groupId, granny } = await planned();
    await ada.as.mutation(api.gifts.renameRecipient, {
      recipientId: granny,
      name: ' Great-granny ',
    });
    await ada.as.mutation(api.gifts.setRecipientArchived, { recipientId: granny, archived: true });
    // Archiving twice changes nothing.
    await ada.as.mutation(api.gifts.setRecipientArchived, { recipientId: granny, archived: true });
    const list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.recipients.map((r) => [r.name, r.archived])).toEqual([
      ['Bob', false],
      ['Great-granny', true],
    ]);
    // Archived recipients keep their history: this Christmas still has the scarf.
    let xmas = await ada.as.query(api.gifts.christmas, { groupId });
    expect(xmas.recipients.map((r) => r.name)).toEqual(['Bob', 'Great-granny']);
    // But they leave new Christmases and the idea bank.
    xmas = await ada.as.query(api.gifts.christmas, { groupId, year: 2027 });
    expect(xmas.recipients.map((r) => r.name)).toEqual(['Bob']);
    expect(
      (await ada.as.query(api.gifts.ideas, { groupId })).recipients.map((r) => r.name),
    ).toEqual(['Bob']);
    await ada.as.mutation(api.gifts.setRecipientArchived, { recipientId: granny, archived: false });
    xmas = await ada.as.query(api.gifts.christmas, { groupId, year: 2027 });
    expect(xmas.recipients.map((r) => r.name)).toEqual(['Bob', 'Great-granny']);
  });

  test('deleting removes gifts, ideas and budgets too', async () => {
    const { t, ada, groupId, granny, scarf } = await planned();
    await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Book' });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 300 });
    await ada.as.mutation(api.gifts.removeRecipient, { recipientId: granny });
    expect(names(await ada.as.query(api.gifts.christmas, { groupId }))).toEqual(['Bob']);
    expect(await ada.as.query(api.gifts.gift, { giftId: scarf })).toBeNull();
    const left = await t.run(async (ctx) => ({
      gifts: (await ctx.db.query('gifts').collect()).map((g) => g.title),
      budgets: (await ctx.db.query('giftBudgets').collect()).length,
    }));
    expect(left).toEqual({ gifts: ['Watch'], budgets: 0 });
  });

  test('the linked member can do none of this to their own recipient', async () => {
    const { bob, bobR } = await planned();
    const refusals = [
      bob.as.mutation(api.gifts.renameRecipient, { recipientId: bobR, name: 'x' }),
      bob.as.mutation(api.gifts.setRecipientArchived, { recipientId: bobR, archived: true }),
      bob.as.mutation(api.gifts.removeRecipient, { recipientId: bobR }),
    ];
    for (const refusal of refusals) await expect(refusal).rejects.toThrow(/NOT_FOUND/);
  });

  test('unlinked members are suggested, with a recipient of the same name', async () => {
    const { ada, groupId } = await planned();
    await ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'KID' });
    const list = await ada.as.query(api.gifts.recipients, { groupId });
    const kidR = list.recipients.find((r) => r.name === 'KID')!._id;
    expect(list.members).toEqual([
      expect.objectContaining({ name: 'bob', linked: true, match: null }),
      expect.objectContaining({ name: 'kid', linked: false, match: kidR }),
    ]);
  });

  test('a member who leaves stays linked, and still sees nothing on coming back', async () => {
    const { t, ada, bob, groupId } = await planned();
    await bob.as.mutation(api.groups.leave, { groupId });
    expect((await ada.as.query(api.gifts.recipients, { groupId })).recipients[0]).toMatchObject({
      name: 'Bob',
      linkedName: 'bob',
    });
    await t.run((ctx) =>
      ctx.db.insert('memberships', { groupId, userId: bob.userId, role: 'member', joinedAt: 1 }),
    );
    expect(names(await bob.as.query(api.gifts.christmas, { groupId }))).toEqual(['Granny']);
  });

  test('a deleted account is unlinked and no longer named as buyer', async () => {
    const { ada, kid, groupId, granny, scarf } = await planned();
    await ada.as.mutation(api.gifts.linkRecipient, { recipientId: granny, memberUserId: null });
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: 'Scarf',
      price: null,
      url: '',
      note: '',
      buyerUserId: kid.userId,
    });
    const kidR = await ada.as.mutation(api.gifts.addRecipient, {
      groupId,
      name: 'Kid',
      memberUserId: kid.userId,
    });
    await kid.as.mutation(api.account.deleteAccount, {});
    const list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.recipients.find((r) => r._id === kidR)).toMatchObject({ linkedUserId: null });
    expect(await ada.as.query(api.gifts.gift, { giftId: scarf })).toMatchObject({
      buyerUserId: null,
      buyerName: null,
    });
  });

  test('the last member leaving deletes all gift data', async () => {
    const { t, ada, bob, kid, groupId, granny } = await planned();
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 300 });
    for (const who of [ada, bob, kid]) await who.as.mutation(api.groups.leave, { groupId });
    const left = await t.run(async (ctx) => [
      (await ctx.db.query('giftRecipients').collect()).length,
      (await ctx.db.query('gifts').collect()).length,
      (await ctx.db.query('giftBudgets').collect()).length,
    ]);
    expect(left).toEqual([0, 0, 0]);
  });
});

describe('Week card', () => {
  test('shows from 1 November through Christmas Eve, counted for the viewer', async () => {
    const { ada, bob, groupId, watch, scarf, bobR, granny } = await planned();
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: watch, status: 'bought' });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'wrapped' });
    const edit = { url: '', note: '', buyerUserId: null };
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: watch,
      title: 'Watch',
      price: 900,
      ...edit,
    });
    await ada.as.mutation(api.gifts.updateGift, {
      giftId: scarf,
      title: 'Scarf',
      price: 200,
      ...edit,
    });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: bobR, year: 2026, amount: 1000 });
    await ada.as.mutation(api.gifts.setBudget, { recipientId: granny, year: 2026, amount: 500 });
    expect(await ada.as.query(api.gifts.weekCard, { groupId })).toEqual({
      year: 2026,
      done: 2,
      total: 2,
      spent: 1100,
      budget: 1500,
    });
    // Bob's own watch and budget are left out of his card.
    expect(await bob.as.query(api.gifts.weekCard, { groupId })).toEqual({
      year: 2026,
      done: 1,
      total: 1,
      spent: 200,
      budget: 500,
    });
  });

  test('is gone outside the window', async () => {
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    const f = await planned();
    expect(await f.ada.as.query(api.gifts.weekCard, { groupId: f.groupId })).toBeNull();
    vi.setSystemTime(new Date('2026-12-24T22:00:00Z'));
    expect(await f.ada.as.query(api.gifts.weekCard, { groupId: f.groupId })).not.toBeNull();
    vi.setSystemTime(new Date('2026-12-24T23:30:00Z'));
    expect(await f.ada.as.query(api.gifts.weekCard, { groupId: f.groupId })).toBeNull();
  });

  test('a family picks an earlier start day', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    const { ada, kid, groupId } = await planned();
    expect(await ada.as.query(api.gifts.weekCard, { groupId })).toBeNull();
    await kid.as.mutation(api.gifts.setCardStart, { groupId, start: '09-15' });
    expect(await ada.as.query(api.gifts.weekCard, { groupId })).not.toBeNull();
    expect((await ada.as.query(api.gifts.recipients, { groupId })).cardStart).toBe('09-15');
    for (const start of ['12-25', '02-30', '9-15', '']) {
      await expect(ada.as.mutation(api.gifts.setCardStart, { groupId, start })).rejects.toThrow(
        /INVALID_DATE/,
      );
    }
  });

  test('no card without active recipients the viewer can see', async () => {
    const { ada, bob, groupId, granny } = await planned();
    await ada.as.mutation(api.gifts.setRecipientArchived, { recipientId: granny, archived: true });
    // Bob only has Granny to see, and she is archived.
    expect(await bob.as.query(api.gifts.weekCard, { groupId })).toBeNull();
    expect(await ada.as.query(api.gifts.weekCard, { groupId })).not.toBeNull();
    const t2 = await family();
    expect(await t2.ada.as.query(api.gifts.weekCard, { groupId: t2.groupId })).toBeNull();
  });

  test('another family can neither see nor set it', async () => {
    const { eve, groupId } = await planned();
    await expect(eve.as.query(api.gifts.weekCard, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.gifts.setCardStart, { groupId, start: '10-01' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('review fixes', () => {
  test('a signed-out caller cannot tell a real gift from a missing one', async () => {
    const { t, ada, scarf, watch } = await planned();
    await ada.as.mutation(api.gifts.removeGift, { giftId: watch });
    for (const giftId of [scarf, watch]) {
      await expect(t.query(api.gifts.gift, { giftId })).rejects.toThrow(/UNAUTHENTICATED/);
      await expect(t.mutation(api.gifts.removeGift, { giftId })).rejects.toThrow(/UNAUTHENTICATED/);
    }
  });

  test('deleting an account unlinks it in families it left earlier too', async () => {
    const { t, ada, bob, groupId, bobR } = await planned();
    await bob.as.mutation(api.groups.leave, { groupId });
    await bob.as.mutation(api.account.deleteAccount, {});
    const link = await t.run(
      async (ctx) => (await ctx.db.get('giftRecipients', bobR))?.memberUserId,
    );
    expect(link ?? null).toBeNull();
    expect(ada).toBeDefined();
  });
});

test('a recipient named by first name is matched to the member', async () => {
  const { t, ada, groupId } = await planned();
  await t.run(async (ctx) => {
    const kid = (await ctx.db.query('users').collect()).find((u) => u.name === 'kid')!;
    await ctx.db.patch('users', kid._id, { name: 'Kid Hansen' });
  });
  const kidR = await ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'Kid' });
  const list = await ada.as.query(api.gifts.recipients, { groupId });
  expect(list.members.find((m) => m.name === 'Kid Hansen')).toMatchObject({ match: kidR });
});

describe('groups of people', () => {
  test('people are grouped under a named group, and the group is done when each has a bought gift', async () => {
    const { ada, kid, groupId, bobR, granny, watch, scarf } = await planned();
    const uncle = await ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'Uncle' });
    const family = await ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: ' In-laws ' });
    await ada.as.mutation(api.gifts.setRecipientGroup, {
      recipientId: granny,
      giftGroupId: family,
    });
    await ada.as.mutation(api.gifts.setRecipientGroup, { recipientId: bobR, giftGroupId: family });

    let xmas = await kid.as.query(api.gifts.christmas, { groupId });
    expect(xmas.groups).toEqual([{ _id: family, name: 'In-laws', done: false }]);
    expect(xmas.recipients.map((r) => [r.name, r.giftGroupId])).toEqual([
      ['Bob', family],
      ['Granny', family],
      ['Uncle', null],
    ]);

    // One bought gift each is enough; an idea left over does not hold it back.
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: watch, status: 'bought' });
    await ada.as.mutation(api.gifts.addGift, { recipientId: granny, title: 'Tea', year: 2026 });
    expect((await kid.as.query(api.gifts.christmas, { groupId })).groups[0].done).toBe(false);
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'wrapped' });
    xmas = await kid.as.query(api.gifts.christmas, { groupId });
    expect(xmas.groups[0].done).toBe(true);
    expect(uncle).toBeDefined();
  });

  test('the done mark counts only the people the viewer may see', async () => {
    const { ada, bob, groupId, bobR, granny, scarf } = await planned();
    const family = await ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: 'In-laws' });
    await ada.as.mutation(api.gifts.setRecipientGroup, {
      recipientId: granny,
      giftGroupId: family,
    });
    await ada.as.mutation(api.gifts.setRecipientGroup, { recipientId: bobR, giftGroupId: family });
    await ada.as.mutation(api.gifts.setGiftStatus, { giftId: scarf, status: 'bought' });
    // Bob's own watch is still an idea, but Bob must not be able to tell.
    expect((await ada.as.query(api.gifts.christmas, { groupId })).groups[0].done).toBe(false);
    expect((await bob.as.query(api.gifts.christmas, { groupId })).groups[0].done).toBe(true);
  });

  test('a group with no one the viewer can see in this Christmas is left out of the list', async () => {
    const { ada, bob, groupId, bobR } = await planned();
    const just = await ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: 'Just Bob' });
    await ada.as.mutation(api.gifts.setRecipientGroup, { recipientId: bobR, giftGroupId: just });
    expect((await bob.as.query(api.gifts.christmas, { groupId })).groups).toEqual([]);
    expect((await ada.as.query(api.gifts.christmas, { groupId })).groups).toHaveLength(1);
  });

  test('groups are named, renamed and deleted; deleting keeps the people', async () => {
    const { ada, eve, bob, groupId, otherGroupId, granny, bobR } = await planned();
    await expect(ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: ' ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
    const g = await ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: 'Kids' });
    await ada.as.mutation(api.gifts.renameGiftGroup, { giftGroupId: g, name: 'Children' });
    await ada.as.mutation(api.gifts.setRecipientGroup, { recipientId: granny, giftGroupId: g });
    let list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.groups).toEqual([{ _id: g, name: 'Children' }]);
    expect(list.recipients.find((r) => r._id === granny)).toMatchObject({ giftGroupId: g });

    // The linked member can't move their own recipient, and others can't touch the group.
    await expect(
      bob.as.mutation(api.gifts.setRecipientGroup, { recipientId: bobR, giftGroupId: g }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.gifts.renameGiftGroup, { giftGroupId: g, name: 'x' }),
    ).rejects.toThrow(/NOT_FOUND/);
    const theirs = await eve.as.mutation(api.gifts.addGiftGroup, {
      groupId: otherGroupId,
      name: 'Theirs',
    });
    await expect(
      ada.as.mutation(api.gifts.setRecipientGroup, { recipientId: granny, giftGroupId: theirs }),
    ).rejects.toThrow(/NOT_FOUND/);

    // A person can be added straight into a group, but only one of this family's.
    const aunt = await ada.as.mutation(api.gifts.addRecipient, {
      groupId,
      name: 'Aunt',
      giftGroupId: g,
    });
    list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.recipients.find((r) => r._id === aunt)).toMatchObject({ giftGroupId: g });
    await expect(
      ada.as.mutation(api.gifts.addRecipient, { groupId, name: 'Nope', giftGroupId: theirs }),
    ).rejects.toThrow(/NOT_FOUND/);

    await ada.as.mutation(api.gifts.removeGiftGroup, { giftGroupId: g });
    list = await ada.as.query(api.gifts.recipients, { groupId });
    expect(list.groups).toEqual([]);
    expect(list.recipients.find((r) => r._id === granny)).toMatchObject({ giftGroupId: null });
  });

  test('deleting the family deletes its groups', async () => {
    const { t, ada, bob, kid, groupId } = await planned();
    await ada.as.mutation(api.gifts.addGiftGroup, { groupId, name: 'Kids' });
    for (const who of [ada, bob, kid]) await who.as.mutation(api.groups.leave, { groupId });
    expect(await t.run(async (ctx) => (await ctx.db.query('giftGroups').collect()).length)).toBe(0);
  });
});
