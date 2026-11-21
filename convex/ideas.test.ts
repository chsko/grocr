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

describe('ideas are not recipes yet (#109)', () => {
  test('Suggest a week leaves ideas out', async () => {
    const { kari, groupId } = await family();
    await kari.as.mutation(api.recipes.save, {
      groupId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [],
    });
    await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    const { candidates } = await kari.as.query(api.mealPlan.suggestions, {
      groupId,
      startDate: MONDAY,
      seed: 1,
    });
    expect(candidates.map((c) => c.title)).toEqual(['Tacos']);
  });

  test('planning suggestions skips an idea', async () => {
    const { t, kari, groupId } = await family();
    const ideaId = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    const planned = await kari.as.mutation(api.mealPlan.planSuggested, {
      groupId,
      dinners: [{ date: WEDNESDAY, recipeId: ideaId }],
    });
    expect(planned).toBe(0);
    expect(await t.run((ctx) => ctx.db.query('mealPlanEntries').collect())).toEqual([]);
  });

  test('an idea cannot be rated', async () => {
    const { kari, groupId } = await family();
    const ideaId = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    await expect(
      kari.as.mutation(api.recipes.rate, { recipeId: ideaId, stars: 4 }),
    ).rejects.toThrow(/IDEA_NOT_RATABLE/);
  });
});

describe('a new idea from Recipes (#110)', () => {
  test('creates an idea without planning it, and reuses one with the same title', async () => {
    const { t, kari, groupId } = await family();
    const first = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    const again = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'lasagne' });
    expect(again).toBe(first);
    expect(await t.run((ctx) => ctx.db.query('mealPlanEntries').collect())).toEqual([]);
    const list = await kari.as.query(api.recipes.list, { groupId });
    expect(list).toEqual([expect.objectContaining({ title: 'Lasagne', isIdea: true })]);
  });

  test('needs a title and a member of the family', async () => {
    const { t, kari, groupId } = await family();
    await expect(kari.as.mutation(api.recipes.createIdea, { groupId, title: ' ' })).rejects.toThrow(
      /TITLE_REQUIRED/,
    );
    const eve = await signedInUser(t, 'Eve');
    await groupWithMembers(t, [eve.userId]);
    await expect(
      eve.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('items on an idea (#107)', () => {
  async function plannedIdea() {
    const f = await family();
    const ideaId = await f.kari.as.mutation(api.mealPlan.planIdea, {
      groupId: f.groupId,
      date: WEDNESDAY,
      title: 'Lasagne',
      servings: 8,
    });
    return { ...f, ideaId };
  }

  async function openRows(t: Awaited<ReturnType<typeof family>>['t']) {
    const items = await t.run((ctx) => ctx.db.query('groceryItems').collect());
    return items
      .filter((i) => !i.removed)
      .map((i) => [i.name, i.qty, i.unit, i.source.kind])
      .sort();
  }

  test('an added item goes on the grocery list, scaled by the servings', async () => {
    const { t, kari, ideaId } = await plannedIdea();
    await kari.as.mutation(api.recipes.addIngredient, {
      recipeId: ideaId,
      name: 'spinat',
      qty: 200,
      unit: 'g',
    });
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Ricotta' });
    expect(await openRows(t)).toEqual([
      ['Ricotta', undefined, undefined, 'meal'],
      ['Spinat', 400, 'g', 'meal'],
    ]);
    const idea = await kari.as.query(api.recipes.get, { recipeId: ideaId });
    expect(idea.ingredients.map((l) => l.name)).toEqual(['Spinat', 'Ricotta']);
    expect(idea.plannedDates).toEqual([WEDNESDAY]);
    expect(idea.createdByName).toBe('Kari');
  });

  test('a removed item leaves the list', async () => {
    const { t, kari, ideaId } = await plannedIdea();
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Spinat' });
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Ricotta' });
    const idea = await kari.as.query(api.recipes.get, { recipeId: ideaId });
    await kari.as.mutation(api.recipes.removeIngredient, {
      recipeId: ideaId,
      index: 0,
      ingredientId: idea.ingredients[0].ingredientId,
    });
    expect(await openRows(t)).toEqual([['Ricotta', undefined, undefined, 'meal']]);
  });

  test('removing a line that has moved is refused', async () => {
    const { kari, ideaId } = await plannedIdea();
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Spinat' });
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Ricotta' });
    const idea = await kari.as.query(api.recipes.get, { recipeId: ideaId });
    await expect(
      kari.as.mutation(api.recipes.removeIngredient, {
        recipeId: ideaId,
        index: 0,
        ingredientId: idea.ingredients[1].ingredientId,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('an empty name adds nothing', async () => {
    const { kari, ideaId } = await plannedIdea();
    await expect(
      kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: '  ' }),
    ).rejects.toThrow(/NAME_REQUIRED/);
  });

  test('another family cannot add or remove items', async () => {
    const { t, kari, ideaId } = await plannedIdea();
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Spinat' });
    const idea = await kari.as.query(api.recipes.get, { recipeId: ideaId });
    const eve = await signedInUser(t, 'Eve');
    await groupWithMembers(t, [eve.userId]);
    await expect(
      eve.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Salt' }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.recipes.removeIngredient, {
        recipeId: ideaId,
        index: 0,
        ingredientId: idea.ingredients[0].ingredientId,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('making an idea a recipe (#108)', () => {
  test('the same document becomes a recipe and its planned days follow', async () => {
    const { t, kari, groupId } = await family();
    const ideaId = await kari.as.mutation(api.mealPlan.planIdea, {
      groupId,
      date: WEDNESDAY,
      title: 'Lasagne',
    });
    await kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Spinat' });
    const saved = await kari.as.mutation(api.recipes.save, {
      groupId,
      recipeId: ideaId,
      makeRecipe: true,
      title: 'Lasagne med spinat',
      servings: 4,
      steps: ['Lag sausen.'],
      ingredients: [{ name: 'Spinat' }, { name: 'Lasagneplater' }],
    });
    expect(saved).toBe(ideaId);

    const recipe = await kari.as.query(api.recipes.get, { recipeId: ideaId });
    expect(recipe.isIdea).toBe(false);
    const week = await kari.as.query(api.mealPlan.week, { groupId, startDate: MONDAY });
    expect(week.dinners).toEqual([
      expect.objectContaining({ title: 'Lasagne med spinat', isIdea: false, recipeId: ideaId }),
    ]);
    const rows = await t.run((ctx) => ctx.db.query('groceryItems').collect());
    expect(rows.map((r) => r.name).sort()).toEqual(['Lasagneplater', 'Spinat']);
    // Now it can get stars.
    await kari.as.mutation(api.recipes.rate, { recipeId: ideaId, stars: 5 });
  });

  test('saving an idea without makeRecipe keeps it an idea', async () => {
    const { kari, groupId } = await family();
    const ideaId = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    await kari.as.mutation(api.recipes.save, {
      groupId,
      recipeId: ideaId,
      title: 'Lasagne',
      servings: 4,
      steps: [],
      ingredients: [],
    });
    expect((await kari.as.query(api.recipes.get, { recipeId: ideaId })).isIdea).toBe(true);
  });
});

describe('review fixes', () => {
  test('a removed (archived) idea takes no new items', async () => {
    const { kari, groupId } = await family();
    const ideaId = await kari.as.mutation(api.recipes.createIdea, { groupId, title: 'Lasagne' });
    await kari.as.mutation(api.recipes.setArchived, { recipeId: ideaId, archived: true });
    await expect(
      kari.as.mutation(api.recipes.addIngredient, { recipeId: ideaId, name: 'Spinat' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
