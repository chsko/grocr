import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';

const MONDAY = '2026-10-26';

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'Ada');
  const groupId = await groupWithMembers(t, [ada.userId]);
  return { t, ada, groupId };
}

describe('ingredients.merge', () => {
  test('moves recipes and lines to the kept item, and the old name finds it again', async () => {
    const { t, ada, groupId } = await family();
    const recipeId = await ada.as.mutation(api.recipes.save, {
      groupId,
      title: 'Grøt',
      servings: 2,
      steps: [],
      ingredients: [{ name: 'Melk', qty: 1, unit: 'l' }],
    });
    await ada.as.mutation(api.mealPlan.set, { groupId, date: MONDAY, recipeId, servings: 2 });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Helmelk' });
    const [melk] = await ada.as.query(api.ingredients.search, { groupId, text: 'Melk' });
    const [helmelk] = await ada.as.query(api.ingredients.search, { groupId, text: 'Helmelk' });
    expect([melk.name, helmelk.name]).toEqual(['Melk', 'Helmelk']);

    await ada.as.mutation(api.ingredients.merge, { fromId: melk._id, intoId: helmelk._id });

    const recipe = await ada.as.query(api.recipes.get, { recipeId });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['Helmelk']);
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items.map((i) => [i.name, i.ingredientId])).toEqual([
      ['Helmelk', helmelk._id],
      ['Helmelk', helmelk._id],
    ]);
    expect(await t.run((ctx) => ctx.db.get('ingredients', melk._id))).toBeNull();

    // Typing the old name again reuses the kept item instead of re-creating the duplicate.
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'melk' });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(new Set(after.items.map((i) => i.ingredientId))).toEqual(new Set([helmelk._id]));
    const found = await ada.as.query(api.ingredients.search, { groupId, text: 'melk' });
    expect(found.map((i) => i.name)).toEqual(['Helmelk']);
  });

  test('a recipe saved with a merged-away id resolves by name; a removed duplicate line goes', async () => {
    const { ada, groupId } = await family();
    const recipeId = await ada.as.mutation(api.recipes.save, {
      groupId,
      title: 'Grøt',
      servings: 2,
      steps: [],
      ingredients: [
        { name: 'Melk', qty: 1, unit: 'l' },
        { name: 'Helmelk', qty: 2, unit: 'dl' },
      ],
    });
    const entryId = await ada.as.mutation(api.mealPlan.set, {
      groupId,
      date: MONDAY,
      recipeId,
      servings: 2,
    });
    const [melk] = await ada.as.query(api.ingredients.search, { groupId, text: 'Melk' });
    const [helmelk] = await ada.as.query(api.ingredients.search, { groupId, text: 'Helmelk' });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    const melkRow = list.items.find((i) => i.ingredientId === melk._id)!;
    await ada.as.mutation(api.grocery.remove, { itemIds: [melkRow._id] });

    await ada.as.mutation(api.ingredients.merge, { fromId: melk._id, intoId: helmelk._id });
    // More servings still rescale the kept item: the duplicate's tombstone didn't freeze it.
    await ada.as.mutation(api.mealPlan.setServings, { entryId, servings: 4 });
    const after = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(after.items.map((i) => [i.name, i.qty, i.unit])).toEqual([['Helmelk', 2.4, 'l']]);

    // An editor still holding the old id saves fine.
    await ada.as.mutation(api.recipes.save, {
      groupId,
      recipeId,
      title: 'Grøt',
      servings: 2,
      steps: [],
      ingredients: [{ ingredientId: melk._id, name: 'Melk', qty: 1, unit: 'l' }],
    });
    const recipe = await ada.as.query(api.recipes.get, { recipeId });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['Helmelk']);
  });

  test('refuses merging an item into itself or across families', async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    const otherGroup = await groupWithMembers(t, [bo.userId]);
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Melk' });
    await bo.as.mutation(api.grocery.addManual, {
      groupId: otherGroup,
      startDate: MONDAY,
      name: 'Melk',
    });
    const [mine] = await ada.as.query(api.ingredients.search, { groupId, text: 'Melk' });
    const [theirs] = await bo.as.query(api.ingredients.search, {
      groupId: otherGroup,
      text: 'Melk',
    });
    await expect(
      ada.as.mutation(api.ingredients.merge, { fromId: mine._id, intoId: mine._id }),
    ).rejects.toThrow(/SAME_INGREDIENT/);
    await expect(
      ada.as.mutation(api.ingredients.merge, { fromId: mine._id, intoId: theirs._id }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      bo.as.mutation(api.ingredients.merge, { fromId: mine._id, intoId: theirs._id }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('ingredients.list and rename', () => {
  test('lists items with recipe counts, sorted by name', async () => {
    const { ada, groupId } = await family();
    await ada.as.mutation(api.recipes.save, {
      groupId,
      title: 'Grøt',
      servings: 2,
      steps: [],
      ingredients: [{ name: 'Melk' }, { name: 'Havregryn' }, { name: 'Melk', qty: 1, unit: 'dl' }],
    });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Banan' });
    const items = await ada.as.query(api.ingredients.list, { groupId });
    expect(items.map((i) => [i.name, i.recipeCount])).toEqual([
      ['Banan', 0],
      ['Havregryn', 1],
      ['Melk', 1],
    ]);
  });

  test('renames an item everywhere and keeps the old name finding it', async () => {
    const { ada, groupId } = await family();
    const recipeId = await ada.as.mutation(api.recipes.save, {
      groupId,
      title: 'Grøt',
      servings: 2,
      steps: [],
      ingredients: [{ name: 'Mlek', qty: 1, unit: 'l' }],
    });
    await ada.as.mutation(api.mealPlan.set, { groupId, date: MONDAY, recipeId, servings: 2 });
    const [mlek] = await ada.as.query(api.ingredients.search, { groupId, text: 'Mlek' });

    await ada.as.mutation(api.ingredients.rename, { ingredientId: mlek._id, name: '  melk ' });

    const recipe = await ada.as.query(api.recipes.get, { recipeId });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['Melk']);
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items.map((i) => i.name)).toEqual(['Melk']);
    const [item] = await ada.as.query(api.ingredients.list, { groupId });
    expect([item.name, item.aliases]).toEqual(['Melk', ['mlek']]);

    // The old spelling reuses the item; renaming back drops the alias again.
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'mlek' });
    expect(await ada.as.query(api.ingredients.list, { groupId })).toHaveLength(1);
    await ada.as.mutation(api.ingredients.rename, { ingredientId: mlek._id, name: 'Mlek' });
    const [back] = await ada.as.query(api.ingredients.list, { groupId });
    expect([back.name, back.aliases]).toEqual(['Mlek', ['melk']]);
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Melk' });
    expect(await ada.as.query(api.ingredients.list, { groupId })).toHaveLength(1);
  });

  test('a capitalisation fix changes only the name', async () => {
    const { ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Rømme' });
    const [item] = await ada.as.query(api.ingredients.list, { groupId });
    await ada.as.mutation(api.ingredients.rename, { ingredientId: item._id, name: 'RØMME' });
    const [after] = await ada.as.query(api.ingredients.list, { groupId });
    expect([after.name, after.aliases]).toEqual(['RØMME', []]);
  });

  test('refuses a name another item has or answers to, and empty names', async () => {
    const { ada, groupId } = await family();
    for (const name of ['Melk', 'Helmelk', 'Egg']) {
      await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name });
    }
    const [egg, helmelk, melk] = await ada.as.query(api.ingredients.list, { groupId });
    await expect(
      ada.as.mutation(api.ingredients.rename, { ingredientId: egg._id, name: 'helmelk' }),
    ).rejects.toThrow(/ITEM_EXISTS/);
    await ada.as.mutation(api.ingredients.merge, { fromId: melk._id, intoId: helmelk._id });
    await expect(
      ada.as.mutation(api.ingredients.rename, { ingredientId: egg._id, name: 'Melk' }),
    ).rejects.toThrow(/ITEM_EXISTS/);
    await expect(
      ada.as.mutation(api.ingredients.rename, { ingredientId: egg._id, name: '   ' }),
    ).rejects.toThrow(/NAME_REQUIRED/);
  });

  test('another family can neither list nor rename the items', async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    await groupWithMembers(t, [bo.userId]);
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Melk' });
    const [melk] = await ada.as.query(api.ingredients.list, { groupId });
    await expect(bo.as.query(api.ingredients.list, { groupId })).rejects.toThrow();
    await expect(
      bo.as.mutation(api.ingredients.rename, { ingredientId: melk._id, name: 'Øl' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
