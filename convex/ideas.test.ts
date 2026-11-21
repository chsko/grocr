import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';
import { addDays, startOfWeek, todayIn } from './lib/week';

// Dinner ideas (#105): a recipe draft that can be planned before the recipe is written down.
const MONDAY = addDays(startOfWeek(todayIn('Europe/Oslo')), 14);
const WEDNESDAY = addDays(MONDAY, 2);
const FRIDAY = addDays(MONDAY, 4);

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const groupId = await groupWithMembers(t, [kari.userId]);
  return { t, kari, groupId };
}

describe('planning an idea (#106)', () => {
  test('creates an idea and plans it on the day', async () => {
    const { t, kari, groupId } = await family();
    await kari.as.mutation(api.mealPlan.planIdea, {
      groupId,
      date: WEDNESDAY,
      title: '  lasagne   med spinat ',
    });

    const recipes = await t.run((ctx) => ctx.db.query('recipes').collect());
    expect(recipes).toEqual([
      expect.objectContaining({
        title: 'Lasagne med spinat',
        isIdea: true,
        servings: 4,
        ingredients: [],
        steps: [],
        createdBy: kari.userId,
      }),
    ]);
    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: MONDAY });
    expect(week.dinners).toEqual([
      expect.objectContaining({
        date: WEDNESDAY,
        title: 'Lasagne med spinat',
        recipeId: recipes[0]._id,
        isNote: false,
        isIdea: true,
        ingredientCount: 0,
        servings: 4,
      }),
    ]);

    const list = await kari.as.query(api.recipes.list, { groupId });
    expect(list).toEqual([expect.objectContaining({ title: 'Lasagne med spinat', isIdea: true })]);
    const one = await kari.as.query(api.recipes.get, { recipeId: recipes[0]._id });
    expect(one.isIdea).toBe(true);
  });

  test('the same title again reuses the idea instead of making a second one', async () => {
    const { t, kari, groupId } = await family();
    const first = await kari.as.mutation(api.mealPlan.planIdea, {
      groupId,
      date: WEDNESDAY,
      title: 'Thai rød karri',
    });
    await kari.as.mutation(api.mealPlan.planIdea, {
      groupId,
      date: FRIDAY,
      title: 'thai RØD karri',
      servings: 6,
    });
    const recipes = await t.run((ctx) => ctx.db.query('recipes').collect());
    expect(recipes).toHaveLength(1);
    const entries = await t.run((ctx) => ctx.db.query('mealPlanEntries').collect());
    expect(entries.map((e) => [e.date, e.recipeId, e.servings])).toEqual([
      [WEDNESDAY, first, 4],
      [FRIDAY, first, 6],
    ]);
  });

  test('a recipe with the same title is not taken for an idea', async () => {
    const { t, kari, groupId } = await family();
    await kari.as.mutation(api.recipes.save, {
      groupId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [],
    });
    await kari.as.mutation(api.mealPlan.planIdea, { groupId, date: WEDNESDAY, title: 'Tacos' });
    const recipes = await t.run((ctx) => ctx.db.query('recipes').collect());
    expect(recipes.map((r) => r.isIdea ?? false)).toEqual([false, true]);
  });

  test('replaces what was planned that day', async () => {
    const { t, kari, groupId } = await family();
    await kari.as.mutation(api.mealPlan.set, { groupId, date: WEDNESDAY, freeText: 'Rester' });
    await kari.as.mutation(api.mealPlan.planIdea, { groupId, date: WEDNESDAY, title: 'Lasagne' });
    const entries = await t.run((ctx) => ctx.db.query('mealPlanEntries').collect());
    expect(entries).toHaveLength(1);
    expect(entries[0].freeText).toBeUndefined();
  });

  test('needs a title', async () => {
    const { kari, groupId } = await family();
    await expect(
      kari.as.mutation(api.mealPlan.planIdea, { groupId, date: WEDNESDAY, title: '   ' }),
    ).rejects.toThrow(/TITLE_REQUIRED/);
  });

  test('another family cannot plan an idea here', async () => {
    const { t, groupId } = await family();
    const eve = await signedInUser(t, 'Eve');
    await groupWithMembers(t, [eve.userId]);
    await expect(
      eve.as.mutation(api.mealPlan.planIdea, { groupId, date: WEDNESDAY, title: 'Lasagne' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
