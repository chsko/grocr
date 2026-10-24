import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { JEV_DAILY_LIMIT } from './ingredients';
import { groupWithMembers, setup, signedInUser } from './test.setup';

const MONDAY = '2026-10-26';

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'Ada');
  const groupId = await groupWithMembers(t, [ada.userId]);
  return { t, ada, groupId };
}

function jevAnswers(choice: string, confidence: number) {
  return vi.fn(async () =>
    Response.json({ answers: { answer: { type: 'choice', choice, confidence } } }),
  );
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
    const fetchMock = jevAnswers('dairy', 0.9);
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

  test('an unsure or invalid jev answer keeps the guess', async () => {
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    const [item] = (await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY }))
      .items;
    const ingredientId = item.ingredientId!;
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', jevAnswers('dairy', 0.3));
    await t.action(internal.classify.section, { ingredientId });
    vi.stubGlobal('fetch', jevAnswers('spaceship', 0.99));
    await t.action(internal.classify.section, { ingredientId });
    const doc = await t.run((ctx) => ctx.db.get('ingredients', ingredientId));
    expect([doc?.section, doc?.sectionSource]).toEqual(['other', 'guess']);
  });

  test("a member's choice wins over jev, even one that arrives later", async () => {
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    const [item] = (await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY }))
      .items;
    const ingredientId = item.ingredientId!;
    await ada.as.mutation(api.ingredients.setSection, { ingredientId, section: 'meat' });
    await t.mutation(internal.classify.applySection, { ingredientId, section: 'dairy' });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items[0].section).toBe('meat');
  });

  test("moving an item checks the family; another family's item is not found", async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    await groupWithMembers(t, [bo.userId]);
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    const [item] = (await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY }))
      .items;
    await expect(
      bo.as.mutation(api.ingredients.setSection, {
        ingredientId: item.ingredientId!,
        section: 'meat',
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('store order', () => {
  test('a member sets the order; it is cleaned up and drives the list order', async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    await groupWithMembers(t, [bo.userId]);
    await ada.as.mutation(api.groups.setSectionOrder, {
      groupId,
      order: ['dairy', 'nope', 'dairy', 'produce'],
    });
    const me = await ada.as.query(api.users.me, {});
    expect(me?.family?.sectionOrder).toEqual([
      'dairy',
      'produce',
      'meat',
      'bakery',
      'dry',
      'frozen',
      'household',
      'other',
    ]);
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.sectionOrder.slice(0, 2)).toEqual(['dairy', 'produce']);
    await expect(
      bo.as.mutation(api.groups.setSectionOrder, { groupId, order: [] }),
    ).rejects.toThrow();
  });
});

describe('jev off or failing', () => {
  test('without a key nothing is scheduled or fetched', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const fetchMock = jevAnswers('dairy', 0.9);
    vi.stubGlobal('fetch', fetchMock);
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a failing jev keeps the guess; a jev section a member changed stays theirs', async () => {
    const { t, ada, groupId } = await family();
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    const [item] = (await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY }))
      .items;
    const ingredientId = item.ingredientId!;
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    await t.action(internal.classify.section, { ingredientId });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    await t.action(internal.classify.section, { ingredientId });
    let doc = await t.run((ctx) => ctx.db.get('ingredients', ingredientId));
    expect(doc?.sectionSource).toBe('guess');

    vi.stubGlobal('fetch', jevAnswers('dairy', 0.9));
    await t.action(internal.classify.section, { ingredientId });
    await ada.as.mutation(api.ingredients.setSection, { ingredientId, section: 'produce' });
    await t.action(internal.classify.section, { ingredientId });
    doc = await t.run((ctx) => ctx.db.get('ingredients', ingredientId));
    expect([doc?.section, doc?.sectionSource]).toEqual(['produce', 'user']);
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
    const group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage).toEqual({ day, count: JEV_DAILY_LIMIT });
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled).toHaveLength(1);
  });
});
