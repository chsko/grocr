import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const groupId = await groupWithMembers(t, [kari.userId]);
  return { t, kari, groupId };
}

const tacos = {
  title: 'tacos',
  servings: 4,
  steps: ['Fry the mince', '  ', 'Serve'],
  ingredients: [
    { name: 'Minced beef', qty: 400, unit: 'g' },
    { name: 'onion', qty: 1, unit: 'pcs' },
    { name: 'Salt' },
    { name: '   ' },
  ],
};

describe('recipes', () => {
  test('saving creates catalog items once and cleans input', async () => {
    const { t, kari, groupId } = await family();
    const recipeId = await kari.as.mutation(api.recipes.save, { groupId, ...tacos });
    const recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.title).toBe('Tacos');
    expect(recipe.steps).toEqual(['Fry the mince', 'Serve']);
    expect(recipe.ingredients.map((i) => [i.name, i.qty, i.unit, i.section])).toEqual([
      ['Minced beef', 400, 'g', 'meat'],
      ['Onion', 1, 'pcs', 'produce'],
      ['Salt', undefined, undefined, 'dry'],
    ]);

    // A second recipe with "Onion" reuses the catalog item.
    await kari.as.mutation(api.recipes.save, {
      groupId,
      title: 'Soup',
      servings: 4,
      steps: [],
      ingredients: [{ name: 'ONION', qty: 2, unit: 'pcs' }],
    });
    const onions = await t.run((ctx) =>
      ctx.db
        .query('ingredients')
        .filter((q) => q.eq(q.field('normalizedName'), 'onion'))
        .collect(),
    );
    expect(onions).toHaveLength(1);
    const found = await kari.as.query(api.ingredients.search, { groupId, text: 'on' });
    expect(found.map((i) => i.name)).toEqual(['Onion']);
  });

  test('icons: guessed from the title until one is picked; unknown icons are dropped', async () => {
    const { kari, groupId } = await family();
    const recipeId = await kari.as.mutation(api.recipes.save, { groupId, ...tacos });
    let recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect([recipe.icon, recipe.shownIcon]).toEqual([undefined, '🌮']);

    await kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos, icon: '🍕' });
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect([recipe.icon, recipe.shownIcon]).toEqual(['🍕', '🍕']);
    const [row] = await kari.as.query(api.recipes.list, { groupId });
    expect(row.icon).toBe('🍕');

    // An older client that doesn't send an icon keeps the picked one.
    await kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos });
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.icon).toBe('🍕');

    await kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos, icon: '<b>' });
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.icon).toBeUndefined();
  });

  test('a recipe can link to its page on the web instead of steps', async () => {
    const { kari, groupId } = await family();
    const recipeId = await kari.as.mutation(api.recipes.save, {
      groupId,
      ...tacos,
      steps: [],
      sourceUrl: ' matprat.no/oppskrifter/tacos ',
    });
    let recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect([recipe.sourceUrl, recipe.steps]).toEqual(['https://matprat.no/oppskrifter/tacos', []]);

    // An older client that doesn't send a link keeps it.
    await kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos });
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.sourceUrl).toBe('https://matprat.no/oppskrifter/tacos');

    for (const bad of ['javascript:alert(1)', 'https://evil.com@matprat.no', 'tacos']) {
      await expect(
        kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos, sourceUrl: bad }),
      ).rejects.toThrow(/INVALID_URL/);
    }
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.sourceUrl).toBe('https://matprat.no/oppskrifter/tacos');

    await kari.as.mutation(api.recipes.save, { groupId, recipeId, ...tacos, sourceUrl: '' });
    recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.sourceUrl).toBeUndefined();
  });

  test("another family can't set a link on a recipe", async () => {
    const { t, kari, groupId } = await family();
    const recipeId = await kari.as.mutation(api.recipes.save, { groupId, ...tacos });
    const ingrid = await signedInUser(t, 'Ingrid');
    const otherGroup = await groupWithMembers(t, [ingrid.userId]);
    for (const target of [groupId, otherGroup]) {
      await expect(
        ingrid.as.mutation(api.recipes.save, {
          groupId: target,
          recipeId,
          ...tacos,
          sourceUrl: 'https://evil.example.com',
        }),
      ).rejects.toThrow();
    }
    const recipe = await kari.as.query(api.recipes.get, { recipeId });
    expect(recipe.sourceUrl).toBeUndefined();
  });

  test('list sorts by title and hides archived recipes', async () => {
    const { kari, groupId } = await family();
    const id = await kari.as.mutation(api.recipes.save, { groupId, ...tacos });
    await kari.as.mutation(api.recipes.save, { groupId, ...tacos, title: 'Apple pie' });
    expect((await kari.as.query(api.recipes.list, { groupId })).map((r) => r.title)).toEqual([
      'Apple pie',
      'Tacos',
    ]);
    await kari.as.mutation(api.recipes.setArchived, { recipeId: id, archived: true });
    expect((await kari.as.query(api.recipes.list, { groupId })).map((r) => r.title)).toEqual([
      'Apple pie',
    ]);
    expect(
      (await kari.as.query(api.recipes.list, { groupId, archived: true })).map((r) => r.title),
    ).toEqual(['Tacos']);
  });

  test('validates title and servings', async () => {
    const { kari, groupId } = await family();
    await expect(
      kari.as.mutation(api.recipes.save, { groupId, ...tacos, title: ' ' }),
    ).rejects.toThrow(/TITLE_REQUIRED/);
    await expect(
      kari.as.mutation(api.recipes.save, { groupId, ...tacos, servings: 0 }),
    ).rejects.toThrow(/INVALID_SERVINGS/);
  });

  test("another family's recipes and ingredients are off limits", async () => {
    const { t, kari, groupId } = await family();
    const eve = await signedInUser(t, 'Eve');
    const eveGroup = await groupWithMembers(t, [eve.userId]);
    const recipeId = await kari.as.mutation(api.recipes.save, { groupId, ...tacos });
    const recipe = await kari.as.query(api.recipes.get, { recipeId });
    const onionId = recipe.ingredients[1].ingredientId;

    await expect(eve.as.query(api.recipes.get, { recipeId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.query(api.recipes.list, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.recipes.setArchived, { recipeId, archived: true }),
    ).rejects.toThrow(/NOT_FOUND/);
    // Editing Kari's recipe through Eve's own family id.
    await expect(
      eve.as.mutation(api.recipes.save, { groupId: eveGroup, recipeId, ...tacos }),
    ).rejects.toThrow(/NOT_FOUND/);
    // Using Kari's catalog item in Eve's recipe.
    await expect(
      eve.as.mutation(api.recipes.save, {
        groupId: eveGroup,
        ...tacos,
        ingredients: [{ ingredientId: onionId, name: 'x' }],
      }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.query(api.ingredients.search, { groupId, text: 'on' })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      eve.as.mutation(api.ingredients.setSection, { ingredientId: onionId, section: 'dairy' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
