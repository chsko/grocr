import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { groupWithMembers, setup, signedInUser, type TestConvex } from './test.setup';
import { addDays, startOfWeek, todayIn } from './lib/week';

// Plan in the future so recipe edits re-sync (they only touch today and later).
const MONDAY = addDays(startOfWeek(todayIn('Europe/Oslo')), 14);
const TUESDAY = addDays(MONDAY, 1);

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const groupId = await groupWithMembers(t, [kari.userId]);
  const recipeId = await kari.as.mutation(api.recipes.save, {
    groupId,
    title: 'Tacos',
    servings: 4,
    steps: [],
    ingredients: [
      { name: 'Minced beef', qty: 400, unit: 'g' },
      { name: 'Onion', qty: 2, unit: 'pcs' },
      { name: 'Salt' },
    ],
  });
  return { t, kari, groupId, recipeId };
}

async function rows(t: TestConvex) {
  const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
  return items
    .filter((i) => !i.removed)
    .map((i) => ({
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      checked: i.checked,
      kind: i.source.kind,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || Number(a.checked) - Number(b.checked));
}

async function rowId(t: TestConvex, name: string) {
  const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
  return items.find((i) => i.name === name)!._id as Id<'groceryItems'>;
}

describe('planning a dinner', () => {
  test('adds scaled ingredients to that week and shows on the week', async () => {
    const { t, kari, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId, servings: 6 });
    expect(await rows(t)).toEqual([
      { name: 'Minced beef', qty: 600, unit: 'g', checked: false, kind: 'meal' },
      { name: 'Onion', qty: 3, unit: 'pcs', checked: false, kind: 'meal' },
      { name: 'Salt', qty: undefined, unit: undefined, checked: false, kind: 'meal' },
    ]);
    const list = await t.run((ctx) => ctx.db.query('groceryLists').unique());
    expect(list).toMatchObject({ startDate: MONDAY, endDate: addDays(MONDAY, 6) });

    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: MONDAY });
    expect(week.dinners).toEqual([
      expect.objectContaining({ date: TUESDAY, title: 'Tacos', isNote: false, servings: 6 }),
    ]);
    expect(week.openLines).toBe(3);
  });

  test('a note adds nothing; replacing the day swaps the ingredients', async () => {
    const { t, kari, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, freeText: 'Pizza night' });
    expect(await rows(t)).toEqual([]);
    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: MONDAY });
    expect(week.dinners.map((d) => [d.title, d.isNote])).toEqual([['Pizza night', true]]);
  });

  test('removing keeps checked and edited lines as manual items', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.grocery.setChecked, {
      itemIds: [await rowId(t, 'Onion')],
      checked: true,
    });
    await kari.as.mutation(api.grocery.editMerged, {
      itemIds: [await rowId(t, 'Salt')],
      qty: 1,
      unit: 'pack',
    });
    await kari.as.mutation(api.mealPlan.remove, { entryId });
    expect(await rows(t)).toEqual([
      { name: 'Onion', qty: 2, unit: 'pcs', checked: true, kind: 'manual' },
      { name: 'Salt', qty: 1, unit: 'pack', checked: false, kind: 'manual' },
    ]);
  });

  test('more servings after shopping adds a line for the extra amount only', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.grocery.setChecked, {
      itemIds: [await rowId(t, 'Minced beef')],
      checked: true,
    });
    await kari.as.mutation(api.mealPlan.setServings, { entryId, servings: 6 });
    expect(await rows(t)).toEqual([
      { name: 'Minced beef', qty: 200, unit: 'g', checked: false, kind: 'meal' },
      { name: 'Minced beef', qty: 400, unit: 'g', checked: true, kind: 'meal' },
      { name: 'Onion', qty: 3, unit: 'pcs', checked: false, kind: 'meal' },
      { name: 'Salt', qty: undefined, unit: undefined, checked: false, kind: 'meal' },
    ]);
    // Fewer servings than already bought: the open extra line goes, the bought one stays.
    await kari.as.mutation(api.mealPlan.setServings, { entryId, servings: 2 });
    expect((await rows(t)).filter((r) => r.name === 'Minced beef')).toEqual([
      { name: 'Minced beef', qty: 400, unit: 'g', checked: true, kind: 'meal' },
    ]);
  });

  test('editing the recipe re-syncs planned dinners but leaves edited lines alone', async () => {
    const { t, kari, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.grocery.editMerged, {
      itemIds: [await rowId(t, 'Onion')],
      qty: 1,
      unit: 'pcs',
    });
    await kari.as.mutation(api.recipes.save, {
      groupId,
      recipeId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [
        { name: 'Minced beef', qty: 500, unit: 'g' },
        { name: 'Onion', qty: 3, unit: 'pcs' },
        { name: 'Tortillas', qty: 8, unit: 'pcs' },
      ],
    });
    expect(await rows(t)).toEqual([
      { name: 'Minced beef', qty: 500, unit: 'g', checked: false, kind: 'meal' },
      { name: 'Onion', qty: 1, unit: 'pcs', checked: false, kind: 'meal' },
      { name: 'Tortillas', qty: 8, unit: 'pcs', checked: false, kind: 'meal' },
    ]);
  });

  test('a merged line edited by hand stays put when either dinner changes', async () => {
    const { t, kari, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    const wed = await kari.as.mutation(api.mealPlan.set, {
      groupId,
      date: addDays(TUESDAY, 1),
      recipeId,
    });
    const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
    const onions = items.filter((i) => i.name === 'Onion').map((i) => i._id);
    expect(onions).toHaveLength(2);
    // "4 onions" -> "1 kg": a different unit family than the recipe's pieces.
    await kari.as.mutation(api.grocery.editMerged, { itemIds: onions, qty: 1, unit: 'kg' });
    await kari.as.mutation(api.mealPlan.setServings, { entryId: wed, servings: 6 });
    expect((await rows(t)).filter((r) => r.name === 'Onion')).toEqual([
      { name: 'Onion', qty: 1, unit: 'kg', checked: false, kind: 'meal' },
    ]);
  });

  test('a removed meal line does not come back on the next sync', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.grocery.remove, { itemIds: [await rowId(t, 'Onion')] });
    await kari.as.mutation(api.mealPlan.setServings, { entryId, servings: 6 });
    expect((await rows(t)).map((r) => r.name)).toEqual(['Minced beef', 'Salt']);
    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: MONDAY });
    expect(week.openLines).toBe(2);
    const list = await kari.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items.map((i) => i.name).sort()).toEqual(['Minced beef', 'Salt']);
    // Removing the dinner cleans up the hidden row too.
    await kari.as.mutation(api.mealPlan.remove, { entryId });
    expect(await t.run((ctx) => ctx.db.query('groceryItems').collect())).toEqual([]);
  });

  test('cleared bought lines are not bought again when servings change', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    await kari.as.mutation(api.grocery.setChecked, {
      itemIds: [await rowId(t, 'Onion')],
      checked: true,
    });
    await kari.as.mutation(api.grocery.clearChecked, { groupId, startDate: MONDAY });
    await kari.as.mutation(api.mealPlan.setServings, { entryId, servings: 2 });
    expect((await rows(t)).map((r) => r.name)).toEqual(['Minced beef', 'Salt']);
  });

  test('carried-over meal lines are not duplicated by a later sync', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });
    const nextMonday = addDays(MONDAY, 7);
    expect(
      await kari.as.mutation(api.grocery.carryOver, { groupId, startDate: nextMonday, move: true }),
    ).toBe(3);
    await kari.as.mutation(api.mealPlan.setServings, { entryId, servings: 6 });
    const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
    expect(items).toHaveLength(3);
  });

  test('past dinners are not re-synced by recipe edits', async () => {
    const { t, kari, groupId, recipeId } = await family();
    const past = addDays(todayIn('Europe/Oslo'), -10);
    await kari.as.mutation(api.mealPlan.set, { groupId, date: past, recipeId });
    await kari.as.mutation(api.recipes.save, {
      groupId,
      recipeId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [{ name: 'Tortillas', qty: 8, unit: 'pcs' }],
    });
    expect((await rows(t)).map((r) => r.name)).toEqual(['Minced beef', 'Onion', 'Salt']);
  });

  test('validates input', async () => {
    const { kari, groupId, recipeId } = await family();
    await expect(
      kari.as.mutation(api.mealPlan.set, { groupId, date: '2026-13-01', recipeId }),
    ).rejects.toThrow(/INVALID_DATE/);
    await expect(
      kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, freeText: '  ' }),
    ).rejects.toThrow(/DINNER_REQUIRED/);
    await expect(
      kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId, servings: 0 }),
    ).rejects.toThrow(/INVALID_SERVINGS/);
  });

  test("other families can't plan with, read or change this family's menu", async () => {
    const { t, kari, groupId, recipeId } = await family();
    const eve = await signedInUser(t, 'Eve');
    const eveGroup = await groupWithMembers(t, [eve.userId]);
    const entryId = await kari.as.mutation(api.mealPlan.set, { groupId, date: TUESDAY, recipeId });

    await expect(eve.as.query(api.mealPlan.week, { groupId, startDate: MONDAY })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      eve.as.mutation(api.mealPlan.set, { groupId: eveGroup, date: TUESDAY, recipeId }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.mutation(api.mealPlan.remove, { entryId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.mealPlan.setServings, { entryId, servings: 8 }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
