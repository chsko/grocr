import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { groupWithMembers, setup, signedInUser, type TestConvex } from './test.setup';
import { addDays, startOfWeek, todayIn } from './lib/week';

const THIS_WEEK = startOfWeek(todayIn('Europe/Oslo'));
const LATER = addDays(THIS_WEEK, 21);

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const ola = await signedInUser(t, 'Ola');
  const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
  const recipe = (title: string) =>
    kari.as.mutation(api.recipes.save, {
      groupId,
      title,
      servings: 4,
      steps: [],
      ingredients: [{ name: `${title} stuff`, qty: 1, unit: 'pcs' }],
    });
  return { t, kari, ola, groupId, recipe };
}

async function planOn(t: TestConvex, groupId: Id<'groups'>, date: string, recipeId: Id<'recipes'>) {
  await t.run((ctx) =>
    ctx.db.insert('mealPlanEntries', {
      groupId,
      date,
      slot: 'dinner',
      recipeId,
      servings: 4,
      createdAt: Date.now(),
    }),
  );
}

describe('rating recipes', () => {
  test('each member rates; the family sees the average and who gave what', async () => {
    const { kari, ola, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    await kari.as.mutation(api.recipes.rate, { recipeId, stars: 5 });
    await ola.as.mutation(api.recipes.rate, { recipeId, stars: 2 });
    await ola.as.mutation(api.recipes.rate, { recipeId, stars: 4 });

    const [row] = await kari.as.query(api.recipes.list, { groupId });
    expect(row.rating).toEqual({ average: 4.5, count: 2, mine: 5 });
    const seenByOla = await ola.as.query(api.recipes.get, { recipeId });
    expect(seenByOla.rating).toEqual({ average: 4.5, count: 2, mine: 4 });
    expect(seenByOla.ratings).toEqual([
      { name: 'Ola', stars: 4, isMe: true },
      { name: 'Kari', stars: 5, isMe: false },
    ]);

    await kari.as.mutation(api.recipes.rate, { recipeId, stars: null });
    const after = await kari.as.query(api.recipes.get, { recipeId });
    expect(after.rating).toEqual({ average: 4, count: 1, mine: null });
  });

  test('only whole stars from 1 to 5', async () => {
    const { kari, recipe } = await family();
    const recipeId = await recipe('Tacos');
    for (const stars of [0, 6, 2.5, Number.NaN]) {
      await expect(kari.as.mutation(api.recipes.rate, { recipeId, stars })).rejects.toThrow(
        /INVALID_RATING/,
      );
    }
  });

  test('another family cannot rate or see ratings', async () => {
    const { t, recipe } = await family();
    const recipeId = await recipe('Tacos');
    const ingrid = await signedInUser(t, 'Ingrid');
    await groupWithMembers(t, [ingrid.userId]);
    await expect(ingrid.as.mutation(api.recipes.rate, { recipeId, stars: 1 })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(ingrid.as.query(api.recipes.get, { recipeId })).rejects.toThrow(/NOT_FOUND/);
  });

  test('a member who left stops counting; deleting the account deletes their stars', async () => {
    const { t, kari, ola, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    await kari.as.mutation(api.recipes.rate, { recipeId, stars: 5 });
    await ola.as.mutation(api.recipes.rate, { recipeId, stars: 1 });
    await ola.as.mutation(api.groups.leave, { groupId });
    expect((await kari.as.query(api.recipes.get, { recipeId })).rating.average).toBe(5);

    await kari.as.mutation(api.recipes.rate, { recipeId, stars: 3 });
    const sara = await signedInUser(t, 'Sara');
    await t.run((ctx) =>
      ctx.db.insert('memberships', {
        groupId,
        userId: sara.userId,
        role: 'member',
        joinedAt: Date.now(),
      }),
    );
    await sara.as.mutation(api.recipes.rate, { recipeId, stars: 5 });
    await sara.as.mutation(api.account.deleteAccount, {});
    const left = await t.run((ctx) => ctx.db.query('recipeRatings').collect());
    expect(left.map((r) => r.userId).sort()).toEqual([kari.userId, ola.userId].sort());
  });

  test('the recipe shows when it was last made, how often, and when it is next', async () => {
    const { t, kari, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    const today = todayIn('Europe/Oslo');
    await planOn(t, groupId, addDays(today, -30), recipeId);
    await planOn(t, groupId, addDays(today, -9), recipeId);
    await planOn(t, groupId, addDays(today, 3), recipeId);
    const got = await kari.as.query(api.recipes.get, { recipeId });
    expect(got).toMatchObject({
      lastCooked: addDays(today, -9),
      nextPlanned: addDays(today, 3),
      timesCooked: 2,
    });
  });
});

describe('suggesting a week', () => {
  test('fills the empty days with the best not-recent recipes, and plans the kept ones', async () => {
    const { t, kari, ola, groupId, recipe } = await family();
    const fav = await recipe('Lasagne');
    const fine = await recipe('Soup');
    const recent = await recipe('Tacos');
    const disliked = await recipe('Liver');
    const planned = await recipe('Pizza');
    const archived = await recipe('Old thing');
    await kari.as.mutation(api.recipes.setArchived, { recipeId: archived, archived: true });
    await kari.as.mutation(api.recipes.rate, { recipeId: fav, stars: 5 });
    await kari.as.mutation(api.recipes.rate, { recipeId: fine, stars: 3 });
    await kari.as.mutation(api.recipes.rate, { recipeId: recent, stars: 5 });
    await kari.as.mutation(api.recipes.rate, { recipeId: disliked, stars: 1 });
    await planOn(t, groupId, addDays(LATER, -5), recent);
    await planOn(t, groupId, addDays(LATER, 2), planned);

    const result = await ola.as.query(api.mealPlan.suggestions, {
      groupId,
      startDate: LATER,
      seed: 42,
    });
    expect(result.days).toEqual([0, 1, 3, 4, 5, 6].map((i) => addDays(LATER, i)));
    const ids = result.candidates.map((c) => c.recipeId);
    expect(ids[0]).toBe(fav);
    expect(ids[1]).toBe(fine);
    expect(new Set(ids.slice(2))).toEqual(new Set([recent, disliked]));
    expect(ids).not.toContain(planned);
    expect(ids).not.toContain(archived);
    expect(result.candidates[0]).toMatchObject({ title: 'Lasagne', rating: 5, servings: 4 });

    // Someone plans Monday meanwhile: it is left alone.
    await kari.as.mutation(api.mealPlan.set, { groupId, date: LATER, recipeId: fine });
    const count = await ola.as.mutation(api.mealPlan.planSuggested, {
      groupId,
      dinners: [
        { date: LATER, recipeId: fav },
        { date: addDays(LATER, 1), recipeId: fav },
      ],
    });
    expect(count).toBe(1);
    const week = await ola.as.query(api.mealPlan.week, { groupId, startDate: LATER });
    const titles = Object.fromEntries(week.dinners.map((d) => [d.date, d.title]));
    expect(titles).toMatchObject({
      [LATER]: 'Soup',
      [addDays(LATER, 1)]: 'Lasagne',
      [addDays(LATER, 2)]: 'Pizza',
    });
    // Its ingredients went on that week's list.
    const list = await ola.as.query(api.grocery.listForWeek, { groupId, startDate: LATER });
    expect(list.items.map((i) => i.name)).toContain('Lasagne stuff');
  });

  test('days before today are not suggested', async () => {
    const { kari, groupId, recipe } = await family();
    await recipe('Tacos');
    const lastWeek = addDays(THIS_WEEK, -7);
    const result = await kari.as.query(api.mealPlan.suggestions, {
      groupId,
      startDate: lastWeek,
      seed: 1,
    });
    expect(result).toEqual({ days: [], candidates: [] });
  });

  test('another family cannot get suggestions or plan with these recipes', async () => {
    const { t, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    const ingrid = await signedInUser(t, 'Ingrid');
    const own = await groupWithMembers(t, [ingrid.userId]);
    await expect(
      ingrid.as.query(api.mealPlan.suggestions, { groupId, startDate: LATER, seed: 1 }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      ingrid.as.mutation(api.mealPlan.planSuggested, {
        groupId: own,
        dinners: [{ date: LATER, recipeId }],
      }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      ingrid.as.mutation(api.mealPlan.planSuggested, {
        groupId,
        dinners: [{ date: LATER, recipeId }],
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('days before today are skipped when planning', async () => {
    const { kari, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    const yesterday = addDays(todayIn('Europe/Oslo'), -1);
    expect(
      await kari.as.mutation(api.mealPlan.planSuggested, {
        groupId,
        dinners: [{ date: yesterday, recipeId }],
      }),
    ).toBe(0);
  });

  test('rejects repeated or bad dates', async () => {
    const { kari, groupId, recipe } = await family();
    const recipeId = await recipe('Tacos');
    await expect(
      kari.as.mutation(api.mealPlan.planSuggested, {
        groupId,
        dinners: [
          { date: LATER, recipeId },
          { date: LATER, recipeId },
        ],
      }),
    ).rejects.toThrow(/INVALID_DATE/);
    await expect(
      kari.as.mutation(api.mealPlan.planSuggested, {
        groupId,
        dinners: [{ date: 'soon', recipeId }],
      }),
    ).rejects.toThrow(/INVALID_DATE/);
  });
});
