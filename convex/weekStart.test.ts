import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';
import { addDays, startOfWeek, todayIn } from './lib/week';

// A Monday-start week in the future, so recipe sync behaves as for upcoming dinners.
const MONDAY = addDays(startOfWeek(todayIn('Europe/Oslo')), 14);
const SUNDAY = addDays(MONDAY, 6);
const SUNDAY_BEFORE = addDays(MONDAY, -1);

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const ola = await signedInUser(t, 'Ola');
  const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
  const recipeId = await kari.as.mutation(api.recipes.save, {
    groupId,
    title: 'Tacos',
    servings: 4,
    steps: [],
    ingredients: [{ name: 'Tortillas', qty: 8, unit: 'pcs' }],
  });
  return { t, kari, ola, groupId, recipeId };
}

const names = (list: { items: { name: string }[] } | null) =>
  (list?.items ?? []).map((i) => i.name).sort();

describe('groups.setWeekStart (GRO-72)', () => {
  test('any member can change it; lists move to the closest week, dinner lines follow the date', async () => {
    const { t, kari, ola, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: SUNDAY, recipeId });
    await kari.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Coffee' });
    expect(
      names(await kari.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY })),
    ).toEqual(['Coffee', 'Tortillas']);

    // Sunday start: Mon-Sat sit in the week from the Sunday before; the Sunday dinner is a week on.
    await ola.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 0 });
    expect((await kari.as.query(api.users.me, {}))?.family?.weekStartsOn).toBe(0);
    const before = await kari.as.query(api.grocery.listForWeek, {
      groupId,
      startDate: SUNDAY_BEFORE,
    });
    expect(names(before)).toEqual(['Coffee']);
    const after = await kari.as.query(api.grocery.listForWeek, { groupId, startDate: SUNDAY });
    expect(names(after)).toEqual(['Tortillas']);
    const lists = await t.run((ctx) => ctx.db.query('groceryLists').collect());
    expect(lists.map((l) => [l.startDate, l.endDate]).sort()).toEqual([
      [SUNDAY_BEFORE, addDays(SUNDAY_BEFORE, 6)],
      [SUNDAY, addDays(SUNDAY, 6)],
    ]);
    // The dinner itself keeps its date.
    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: SUNDAY });
    expect(week.dinners.map((d) => d.date)).toEqual([SUNDAY]);

    // Adding to the new weeks works, and changing back puts everything on Monday weeks again.
    await kari.as.mutation(api.grocery.addManual, { groupId, startDate: SUNDAY, name: 'Milk' });
    await kari.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 1 });
    expect(
      names(await kari.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY })),
    ).toEqual(['Coffee', 'Tortillas']);
    expect(
      names(
        await kari.as.query(api.grocery.listForWeek, { groupId, startDate: addDays(MONDAY, 7) }),
      ),
    ).toEqual(['Milk']);
  });

  test('editing the dinner after a change keeps its lines on the right list', async () => {
    const { t, kari, groupId, recipeId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: SUNDAY, recipeId });
    await kari.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 0 });
    await kari.as.mutation(api.mealPlan.set, { groupId, date: SUNDAY, recipeId, servings: 8 });
    const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
    expect(items.filter((i) => !i.removed).map((i) => i.qty)).toEqual([16]);
    const list = await kari.as.query(api.grocery.listForWeek, { groupId, startDate: SUNDAY });
    expect(list?.items.map((i) => i.qty)).toEqual([16]);
  });

  test('lines carried over to the next week stay there', async () => {
    const { kari, groupId, recipeId } = await family();
    const wednesday = addDays(MONDAY, 2);
    const nextMonday = addDays(MONDAY, 7);
    await kari.as.mutation(api.mealPlan.set, { groupId, date: wednesday, recipeId });
    await kari.as.mutation(api.grocery.carryOver, { groupId, startDate: nextMonday, move: true });
    await kari.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 0 });
    const next = await kari.as.query(api.grocery.listForWeek, {
      groupId,
      startDate: addDays(nextMonday, -1),
    });
    expect(names(next)).toEqual(['Tortillas']);
    const before = await kari.as.query(api.grocery.listForWeek, {
      groupId,
      startDate: SUNDAY_BEFORE,
    });
    expect(names(before)).toEqual([]);
  });

  test('rejects days outside 0-6 and other families', async () => {
    const { t, kari, groupId } = await family();
    await expect(
      kari.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 7 }),
    ).rejects.toThrow(/INVALID_DAY/);
    await expect(
      kari.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 1.5 }),
    ).rejects.toThrow(/INVALID_DAY/);
    const eve = await signedInUser(t, 'Eve');
    await expect(
      eve.as.mutation(api.groups.setWeekStart, { groupId, weekStartsOn: 0 }),
    ).rejects.toThrow();
    expect((await kari.as.query(api.users.me, {}))?.family?.weekStartsOn).toBe(1);
  });
});
