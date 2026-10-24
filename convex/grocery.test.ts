import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, listWithItems, setup, signedInUser } from './test.setup';

const MONDAY = '2026-10-26';

describe('grocery.listForWeek', () => {
  test('returns the list and its items for a member', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    await listWithItems(t, groupId, MONDAY, ['Milk', 'Onion']);

    const result = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(result?.items.map((item) => item.name).sort()).toEqual(['Milk', 'Onion']);
  });

  test('returns null for a week with no list', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    expect(await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY })).toBeNull();
  });

  test('rejects users from another family', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const eve = await signedInUser(t, 'eve');
    const groupId = await groupWithMembers(t, [ada.userId]);
    await groupWithMembers(t, [eve.userId]);

    await expect(
      eve.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('rejects signed-out callers', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    await expect(t.query(api.grocery.listForWeek, { groupId, startDate: MONDAY })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });
});

describe('grocery.setChecked', () => {
  test('sets the state and is idempotent when resent', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const bob = await signedInUser(t, 'bob');
    const groupId = await groupWithMembers(t, [ada.userId, bob.userId]);
    const { itemIds } = await listWithItems(t, groupId, MONDAY, ['Milk', 'Onion']);

    expect(await ada.as.mutation(api.grocery.setChecked, { itemIds, checked: true })).toBe(2);
    // Bob ticks the same rows (or Ada's offline resend arrives): nothing changes.
    expect(await bob.as.mutation(api.grocery.setChecked, { itemIds, checked: true })).toBe(0);

    const items = await t.run((ctx) => Promise.all(itemIds.map((id) => ctx.db.get(id))));
    for (const item of items) {
      expect(item?.checked).toBe(true);
      expect(item?.checkedBy).toBe(ada.userId);
    }

    expect(await bob.as.mutation(api.grocery.setChecked, { itemIds, checked: false })).toBe(2);
    const unchecked = await t.run((ctx) => ctx.db.get(itemIds[0]));
    expect(unchecked?.checked).toBe(false);
    expect(unchecked?.checkedBy).toBeUndefined();
  });

  test('skips rows that were deleted meanwhile', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    const { itemIds } = await listWithItems(t, groupId, MONDAY, ['Milk', 'Onion']);
    await t.run((ctx) => ctx.db.delete(itemIds[0]));

    expect(await ada.as.mutation(api.grocery.setChecked, { itemIds, checked: true })).toBe(1);
  });

  test("another family's rows are skipped exactly like deleted ones", async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const eve = await signedInUser(t, 'eve');
    const adaGroup = await groupWithMembers(t, [ada.userId]);
    const eveGroup = await groupWithMembers(t, [eve.userId]);
    const foreign = await listWithItems(t, adaGroup, MONDAY, ['Milk']);
    const own = await listWithItems(t, eveGroup, MONDAY, ['Bread', 'Gone']);
    await t.run((ctx) => ctx.db.delete(own.itemIds[1]));

    // Probing a foreign id and a deleted id gives the same answer.
    const probeForeign = await eve.as.mutation(api.grocery.setChecked, {
      itemIds: foreign.itemIds,
      checked: true,
    });
    const probeDeleted = await eve.as.mutation(api.grocery.setChecked, {
      itemIds: [own.itemIds[1]],
      checked: true,
    });
    expect(probeForeign).toBe(0);
    expect(probeDeleted).toBe(0);

    // A mixed batch only touches the caller's own rows.
    expect(
      await eve.as.mutation(api.grocery.setChecked, {
        itemIds: [own.itemIds[0], ...foreign.itemIds],
        checked: true,
      }),
    ).toBe(1);
    const item = await t.run((ctx) => ctx.db.get(foreign.itemIds[0]));
    expect(item?.checked).toBe(false);
  });

  test('rejects signed-out callers and oversized batches', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    const { itemIds } = await listWithItems(t, groupId, MONDAY, ['Milk']);
    await expect(t.mutation(api.grocery.setChecked, { itemIds, checked: true })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
    await expect(
      ada.as.mutation(api.grocery.setChecked, {
        itemIds: Array.from({ length: 101 }, () => itemIds[0]),
        checked: true,
      }),
    ).rejects.toThrow(/TOO_MANY_ITEMS/);
  });
});
