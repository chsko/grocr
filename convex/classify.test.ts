import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { JEV_DAILY_LIMIT, SORT_BATCH } from './classify';
import {
  addItem,
  fakeJev,
  groupWithMembers,
  ingredient,
  setup,
  signedInUser,
  type JevRequest,
} from './test.setup';

function jevPicks(picks: Record<string, string>, confidence = 0.9) {
  return vi.fn(fakeJev(picks, confidence));
}

const MONDAY = '2026-10-26';

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'Ada');
  const groupId = await groupWithMembers(t, [ada.userId]);
  return { t, ada, groupId };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ingredient sections', () => {
  test('jev refines the keyword guess for a new item, and lists follow at once', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevPicks({ Halloumi: 'Milk, cheese' });
    vi.stubGlobal('fetch', fetchMock);
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    let list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items[0].section).toBe('other');

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items[0].section).toBe('dairy');
  });

  test('jev is offered the family’s own sections, by name', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevPicks({ 'Taco shells': 'Taco shelf' });
    vi.stubGlobal('fetch', fetchMock);
    const { t, ada, groupId } = await family();
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Taco shelf' });
    await ada.as.mutation(api.sections.rename, { groupId, key: 'dry', name: 'Hermetikk' });
    const id = await addItem(ada, groupId, 'Taco shells');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await ingredient(t, id)).toEqual([key, 'jev']);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as JevRequest;
    const criteria = Object.values(body.questions.i0.criteria);
    expect(criteria).toContain('Taco shelf (a section this family made themselves)');
    expect(criteria.some((c) => c.startsWith('Hermetikk (renamed by the family; Pasta'))).toBe(
      true,
    );
    expect(criteria).toHaveLength(9);
  });

  test('an unsure or invalid jev answer keeps the guess', async () => {
    const { t, ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Halloumi');
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', jevPicks({ Halloumi: 'Milk, cheese' }, 0.3));
    await t.action(internal.classify.sort, { groupId, ingredientIds: [id] });
    vi.stubGlobal('fetch', jevPicks({}, 0.99));
    await t.action(internal.classify.sort, { groupId, ingredientIds: [id] });
    expect(await ingredient(t, id)).toEqual(['other', 'guess']);
  });

  test("a member's choice wins over jev, even one that arrives later", async () => {
    const { t, ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Halloumi');
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: id, section: 'meat' });
    await t.mutation(internal.classify.applySections, {
      groupId,
      moves: [{ ingredientId: id, section: 'dairy' }],
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items[0].section).toBe('meat');
  });

  test('a jev answer for a section deleted in the meantime is dropped', async () => {
    const { t, ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Halloumi');
    await ada.as.mutation(api.sections.remove, { groupId, key: 'dairy' });
    await t.mutation(internal.classify.applySections, {
      groupId,
      moves: [{ ingredientId: id, section: 'dairy' }],
    });
    expect(await ingredient(t, id)).toEqual(['other', 'guess']);
  });

  test('jev never moves another family’s item', async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    const boGroup = await groupWithMembers(t, [bo.userId]);
    const id = await addItem(ada, groupId, 'Halloumi');
    await t.mutation(internal.classify.applySections, {
      groupId: boGroup,
      moves: [{ ingredientId: id, section: 'dairy' }],
    });
    expect(await ingredient(t, id)).toEqual(['other', 'guess']);
    expect(
      await t.query(internal.classify.sortInput, { groupId: boGroup, ingredientIds: [id] }),
    ).toMatchObject({ items: [] });
  });

  test('a member can move an item into the family’s own section, not an unknown one', async () => {
    const { ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Halloumi');
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: id, section: key });
    await expect(
      ada.as.mutation(api.ingredients.setSection, { ingredientId: id, section: 'spaceship' }),
    ).rejects.toThrow(/INVALID_SECTION/);
  });

  test("moving an item checks the family; another family's item is not found", async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    await groupWithMembers(t, [bo.userId]);
    const id = await addItem(ada, groupId, 'Halloumi');
    await expect(
      bo.as.mutation(api.ingredients.setSection, { ingredientId: id, section: 'meat' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('jev off or failing', () => {
  test('without a key nothing is scheduled or fetched', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const fetchMock = jevPicks({ Halloumi: 'Milk, cheese' });
    vi.stubGlobal('fetch', fetchMock);
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a failing jev keeps the guess; a jev section a member changed stays theirs', async () => {
    const { t, ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Halloumi');
    const sort = { groupId, ingredientIds: [id] };
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    await t.action(internal.classify.sort, sort);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    await t.action(internal.classify.sort, sort);
    expect(await ingredient(t, id)).toEqual(['other', 'guess']);

    vi.stubGlobal('fetch', jevPicks({ Halloumi: 'Milk, cheese' }));
    await t.action(internal.classify.sort, sort);
    expect(await ingredient(t, id)).toEqual(['dairy', 'jev']);
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: id, section: 'produce' });
    await t.action(internal.classify.sort, sort);
    expect(await ingredient(t, id)).toEqual(['produce', 'user']);
  });

  test('a family gets at most JEV_DAILY_LIMIT sorting calls a day', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const { t, ada, groupId } = await family();
    const day = new Date().toISOString().slice(0, 10);
    await t.run((ctx) =>
      ctx.db.patch('groups', groupId, { jevUsage: { day, count: JEV_DAILY_LIMIT - 1 } }),
    );
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Sriracha' });
    await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    const group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage).toEqual({ day, count: JEV_DAILY_LIMIT });
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled).toHaveLength(1);
  });

  test(`items are sorted ${SORT_BATCH} to a call`, async () => {
    const { t, ada, groupId } = await family();
    const names = Array.from({ length: SORT_BATCH + 5 }, (_, i) => `Item ${i}`);
    vi.stubEnv('TYPESAFE_API_KEY', '');
    for (const name of names) {
      await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name });
    }
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevPicks({});
    vi.stubGlobal('fetch', fetchMock);
    await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage?.count).toBe(2);
  });
});

describe('recipe icons', () => {
  /** jev picks `icon` for every recipe it is asked about; the mock counts only those calls. */
  function jevIcon(icon: string, confidence = 0.9) {
    const asked = vi.fn();
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        state: { dinner?: string };
        questions: Record<string, { criteria: Record<string, string> }>;
      };
      if (body.state.dinner === undefined) return Response.json({ answers: {} });
      asked(body.state.dinner);
      const choice = Object.entries(body.questions.pick.criteria).find(([, d]) =>
        d.startsWith(icon),
      )![0];
      return Response.json({ answers: { pick: { type: 'choice', choice, confidence } } });
    });
    return asked;
  }

  async function save(
    ada: Awaited<ReturnType<typeof signedInUser>>,
    groupId: Parameters<typeof addItem>[1],
    title: string,
    extra: { recipeId?: Id<'recipes'>; icon?: string } = {},
  ) {
    return await ada.as.mutation(api.recipes.save, {
      groupId,
      title,
      servings: 4,
      steps: [],
      ingredients: [],
      ...extra,
    });
  }

  test('jev picks an icon for a title the keywords miss, until the title changes', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevIcon('🌮');
    const { t, ada, groupId } = await family();
    const recipeId = await save(ada, groupId, 'Fredagskos');
    expect((await ada.as.query(api.recipes.get, { recipeId })).shownIcon).toBe('🍽️');

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await ada.as.query(api.recipes.get, { recipeId })).shownIcon).toBe('🌮');
    const [row] = await ada.as.query(api.recipes.list, { groupId });
    expect(row.icon).toBe('🌮');

    // Saving under the same title keeps the guess without asking again.
    await save(ada, groupId, 'Fredagskos', { recipeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await ada.as.query(api.recipes.get, { recipeId })).shownIcon).toBe('🌮');

    // A title the keywords know doesn't ask jev, and drops the old guess.
    await save(ada, groupId, 'Fiskesuppe', { recipeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    const recipe = await ada.as.query(api.recipes.get, { recipeId });
    expect([recipe.shownIcon, recipe.guessedIcon]).toEqual(['🍲', undefined]);
  });

  test("an unsure jev leaves the plate, and saves of that title don't ask again", async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const asked = jevIcon('🌮', 0.3);
    const { t, ada, groupId } = await family();
    const recipeId = await save(ada, groupId, 'Fredagskos');
    await save(ada, groupId, 'Fredagskos', { recipeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await save(ada, groupId, 'Fredagskos', { recipeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(asked).toHaveBeenCalledOnce();
    expect((await ada.as.query(api.recipes.get, { recipeId })).shownIcon).toBe('🍽️');
  });

  test('a picked icon is never asked about', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const asked = jevIcon('🌮');
    const { t, ada, groupId } = await family();
    await save(ada, groupId, 'Mormors middag', { icon: '🍕' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(asked).not.toHaveBeenCalled();
  });

  test('an answer for an old title, or after an icon was picked, is dropped', async () => {
    const { t, ada, groupId } = await family();
    const recipeId = await save(ada, groupId, 'Søndagsmiddag');
    await t.mutation(internal.classify.applyIcon, {
      recipeId,
      title: 'Lørdagsmiddag',
      icon: '🌮',
    });
    expect((await ada.as.query(api.recipes.get, { recipeId })).guessedIcon).toBeUndefined();

    await save(ada, groupId, 'Søndagsmiddag', { recipeId, icon: '🍕' });
    await t.mutation(internal.classify.applyIcon, {
      recipeId,
      title: 'Søndagsmiddag',
      icon: '🌮',
    });
    const recipe = await ada.as.query(api.recipes.get, { recipeId });
    expect([recipe.shownIcon, recipe.guessedIcon]).toEqual(['🍕', undefined]);
  });

  test('without a key nothing is asked', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const fetchMock = jevIcon('🌮');
    const { t, ada, groupId } = await family();
    await save(ada, groupId, 'Fredagskos');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
