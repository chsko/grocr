import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { addItem, groupWithMembers, setup, signedInUser } from './test.setup';

const MONDAY = '2026-10-26';
const NEXT_MONDAY = '2026-11-02';

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'ada');
  const bob = await signedInUser(t, 'bob');
  const eve = await signedInUser(t, 'eve');
  const groupId = await groupWithMembers(t, [ada.userId, bob.userId]);
  const otherGroupId = await groupWithMembers(t, [eve.userId]);
  return { t, ada, bob, eve, groupId, otherGroupId };
}

describe('staples', () => {
  test('a member adds staples by name; existing items are reused', async () => {
    const { ada, bob, groupId } = await family();
    const milk = await addItem(ada, groupId, 'Melk');
    expect(await ada.as.mutation(api.staples.add, { groupId, name: 'melk ' })).toBe(milk);
    const bread = await bob.as.mutation(api.staples.add, { groupId, name: 'Brød' });

    const staples = await bob.as.query(api.staples.list, { groupId });
    expect(staples.map((s) => [s._id, s.name])).toEqual([
      [bread, 'Brød'],
      [milk, 'Melk'],
    ]);
  });

  test('set makes an item a staple or stops it being one, and is idempotent', async () => {
    const { ada, groupId } = await family();
    const coffee = await addItem(ada, groupId, 'Kaffe');
    await ada.as.mutation(api.staples.set, { ingredientId: coffee, staple: true });
    await ada.as.mutation(api.staples.set, { ingredientId: coffee, staple: true });
    expect((await ada.as.query(api.staples.list, { groupId })).map((s) => s.name)).toEqual([
      'Kaffe',
    ]);
    await ada.as.mutation(api.staples.set, { ingredientId: coffee, staple: false });
    expect(await ada.as.query(api.staples.list, { groupId })).toEqual([]);
  });

  test('another family can neither see nor change them', async () => {
    const { ada, eve, groupId, otherGroupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });

    await expect(eve.as.query(api.staples.list, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.mutation(api.staples.add, { groupId, name: 'Øl' })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      eve.as.mutation(api.staples.set, { ingredientId: milk, staple: false }),
    ).rejects.toThrow(/NOT_FOUND/);
    // Picking another family's item by id is refused too.
    await expect(
      eve.as.mutation(api.staples.add, { groupId: otherGroupId, ingredientId: milk, name: 'x' }),
    ).rejects.toThrow(/NOT_FOUND/);
    expect((await ada.as.query(api.staples.list, { groupId })).length).toBe(1);
  });

  test('a blank name is refused', async () => {
    const { ada, groupId } = await family();
    await expect(ada.as.mutation(api.staples.add, { groupId, name: '  ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
  });

  test('merging a plain item into a staple keeps the staple', async () => {
    const { ada, groupId } = await family();
    const melk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    const helmelk = await addItem(ada, groupId, 'Helmelk');
    await ada.as.mutation(api.ingredients.merge, { fromId: helmelk, intoId: melk });
    expect((await ada.as.query(api.staples.list, { groupId })).map((s) => s._id)).toEqual([melk]);
  });

  test('merging a staple into another item keeps it a staple', async () => {
    const { ada, groupId } = await family();
    const melk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    const helmelk = await addItem(ada, groupId, 'Helmelk');
    await ada.as.mutation(api.ingredients.merge, { fromId: melk, intoId: helmelk });
    expect((await ada.as.query(api.staples.list, { groupId })).map((s) => s._id)).toEqual([
      helmelk,
    ]);
  });
});

describe('the staples offer on a week list', () => {
  test('offers staples that are not on the list in any state', async () => {
    const { ada, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    const bread = await ada.as.mutation(api.staples.add, { groupId, name: 'Brød' });
    const coffee = await ada.as.mutation(api.staples.add, { groupId, name: 'Kaffe' });

    // Before the week has a list, all of them are offered.
    const empty = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(empty.listId).toBeNull();
    expect(empty.staplesOffer.map((s) => s.name)).toEqual(['Brød', 'Kaffe', 'Melk']);
    expect(empty.stapleIds).toEqual([bread, coffee, milk]);

    // Milk is on the list and bought, bread is at home: only coffee is still offered.
    await ada.as.mutation(api.grocery.addStaples, {
      groupId,
      startDate: MONDAY,
      ingredientIds: [milk, bread],
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    const row = (id: string) => list.items.find((i) => i.ingredientId === id)!._id;
    await ada.as.mutation(api.grocery.setChecked, { itemIds: [row(milk)], checked: true });
    await ada.as.mutation(api.grocery.setAtHome, { itemIds: [row(bread)], atHome: true });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.staplesOffer).toEqual([{ ingredientId: coffee, name: 'Kaffe' }]);

    // Each week offers them afresh.
    const next = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: NEXT_MONDAY });
    expect(next.staplesOffer.length).toBe(3);
  });

  test('addStaples adds each staple once, as a manual item by the member', async () => {
    const { t, ada, bob, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    const plain = await addItem(ada, groupId, 'Løk');
    const args = { groupId, startDate: NEXT_MONDAY, ingredientIds: [milk, milk, plain] };

    expect(await ada.as.mutation(api.grocery.addStaples, args)).toBe(1);
    // Bob taps "Add all" too, or Ada's resend arrives: nothing more is added.
    expect(await bob.as.mutation(api.grocery.addStaples, args)).toBe(0);

    const list = await ada.as.query(api.grocery.listForWeek, {
      groupId,
      startDate: NEXT_MONDAY,
    });
    expect(list.items.map((i) => [i.name, i.source])).toEqual([
      ['Melk', { kind: 'manual', addedBy: ada.userId }],
    ]);
    expect(list.staplesOffer).toEqual([]);
    const lists = await t.run((ctx) => ctx.db.query('groceryLists').collect());
    expect(lists.find((l) => l.startDate === NEXT_MONDAY)?.endDate).toBe('2026-11-08');
  });

  test('a staple added once is not offered again that week, even after it is gone', async () => {
    const { ada, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await ada.as.mutation(api.grocery.addStaples, {
      groupId,
      startDate: MONDAY,
      ingredientIds: [milk],
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    await ada.as.mutation(api.grocery.remove, { itemIds: [list.items[0]._id] });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.staplesOffer).toEqual([]);
    // Adding it again by hand from the offer's ids still works, once.
    expect(
      await ada.as.mutation(api.grocery.addStaples, {
        groupId,
        startDate: MONDAY,
        ingredientIds: [milk],
      }),
    ).toBe(1);
  });

  test('bought staples are not offered again after "Clear checked"', async () => {
    const { ada, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await ada.as.mutation(api.grocery.addStaples, {
      groupId,
      startDate: MONDAY,
      ingredientIds: [milk],
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    await ada.as.mutation(api.grocery.setChecked, {
      itemIds: [list.items[0]._id],
      checked: true,
    });
    await ada.as.mutation(api.grocery.clearChecked, { groupId, startDate: MONDAY });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.items).toEqual([]);
    expect(after.staplesOffer).toEqual([]);
  });

  test('tells the app which carry-over items are staples, so it can leave them out', async () => {
    const { ada, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await ada.as.mutation(api.staples.add, { groupId, name: 'Brød' });
    await ada.as.mutation(api.grocery.addStaples, {
      groupId,
      startDate: MONDAY,
      ingredientIds: [milk],
    });
    // Last week's milk was never bought: the carry-over card names it, the offer still has it.
    const week = await ada.as.query(api.grocery.listForWeek, {
      groupId,
      startDate: NEXT_MONDAY,
    });
    expect(week.carryOver).toEqual({ count: 1, ingredientIds: [milk] });
    expect(week.staplesOffer.map((s) => s.name)).toEqual(['Brød', 'Melk']);
  });

  test('staples typed by hand are not offered again once cleared or removed', async () => {
    const { ada, groupId } = await family();
    await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await ada.as.mutation(api.staples.add, { groupId, name: 'Brød' });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'melk' });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Brød' });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Løk' });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    const row = (name: string) => list.items.find((i) => i.name === name)!._id;
    await ada.as.mutation(api.grocery.setChecked, { itemIds: [row('Melk')], checked: true });
    await ada.as.mutation(api.grocery.clearChecked, { groupId, startDate: MONDAY });
    await ada.as.mutation(api.grocery.remove, { itemIds: [row('Brød'), row('Løk')] });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.items).toEqual([]);
    expect(after.staplesOffer).toEqual([]);
  });

  test('a handled staple stays handled when it is merged into another item', async () => {
    const { ada, groupId } = await family();
    const melk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    const helmelk = await addItem(ada, groupId, 'Helmelk');
    const before = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    await ada.as.mutation(api.grocery.remove, { itemIds: [before.items[0]._id] });
    await ada.as.mutation(api.grocery.addStaples, {
      groupId,
      startDate: MONDAY,
      ingredientIds: [melk],
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    await ada.as.mutation(api.grocery.remove, { itemIds: list.items.map((i) => i._id) });
    await ada.as.mutation(api.ingredients.merge, { fromId: melk, intoId: helmelk });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.stapleIds).toEqual([helmelk]);
    expect(after.staplesOffer).toEqual([]);
  });

  test('"Not this week" hides the offer for that week only', async () => {
    const { ada, bob, groupId } = await family();
    await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await bob.as.mutation(api.grocery.dismissStaples, { groupId, startDate: MONDAY });
    const week = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(week.staplesOffer).toEqual([]);
    expect(week.stapleIds.length).toBe(1);
    const next = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: NEXT_MONDAY });
    expect(next.staplesOffer.length).toBe(1);
  });

  test('another family cannot add to or dismiss the offer, nor add its own items', async () => {
    const { ada, eve, groupId, otherGroupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });

    await expect(
      eve.as.mutation(api.grocery.addStaples, {
        groupId,
        startDate: MONDAY,
        ingredientIds: [milk],
      }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.grocery.dismissStaples, { groupId, startDate: MONDAY }),
    ).rejects.toThrow(/NOT_FOUND/);
    // Ada's staple id on Eve's own list is skipped, not copied over.
    expect(
      await eve.as.mutation(api.grocery.addStaples, {
        groupId: otherGroupId,
        startDate: MONDAY,
        ingredientIds: [milk],
      }),
    ).toBe(0);
    const own = await eve.as.query(api.grocery.listForWeek, {
      groupId: otherGroupId,
      startDate: MONDAY,
    });
    expect(own.items).toEqual([]);
  });

  test('refuses dates that are not a week start', async () => {
    const { ada, groupId } = await family();
    const milk = await ada.as.mutation(api.staples.add, { groupId, name: 'Melk' });
    await expect(
      ada.as.mutation(api.grocery.addStaples, {
        groupId,
        startDate: '2026-10-28',
        ingredientIds: [milk],
      }),
    ).rejects.toThrow(/INVALID_DATE/);
  });
});
