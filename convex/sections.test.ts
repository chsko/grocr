import { afterEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { JEV_DAILY_LIMIT, JEV_RESERVE, SORT_BATCH } from './classify';
import { SECTIONS } from './lib/catalog';
import { RESORT_ITEMS } from './sections';
import { addItem, fakeJev, groupWithMembers, ingredient, setup, signedInUser } from './test.setup';

function jevPicks(picks: Record<string, string>, confidence = 0.9) {
  return vi.fn(fakeJev(picks, confidence));
}

const MONDAY = '2026-10-26';

async function family() {
  const t = setup();
  const ada = await signedInUser(t, 'Ada');
  const groupId = await groupWithMembers(t, [ada.userId]);
  // No jev unless a test asks for it.
  vi.stubEnv('TYPESAFE_API_KEY', '');
  return { t, ada, groupId };
}

async function sectionsOf(ada: Awaited<ReturnType<typeof signedInUser>>) {
  return (await ada.as.query(api.users.me, {}))!.family!.sections;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('family sections', () => {
  test('a family starts with the built-in sections, in their old store order', async () => {
    const { t, ada, groupId } = await family();
    expect(await sectionsOf(ada)).toEqual(SECTIONS.map((key) => ({ key })));
    await t.run((ctx) => ctx.db.patch('groups', groupId, { sectionOrder: ['dairy', 'produce'] }));
    expect((await sectionsOf(ada)).slice(0, 3).map((s) => s.key)).toEqual([
      'dairy',
      'produce',
      'meat',
    ]);
  });

  test('a new section goes before Other, and names must be free', async () => {
    const { ada, groupId } = await family();
    const key = await ada.as.mutation(api.sections.add, { groupId, name: '  taco   shelf ' });
    const sections = await sectionsOf(ada);
    expect(sections.slice(-2)).toEqual([{ key, name: 'Taco shelf' }, { key: 'other' }]);
    await expect(
      ada.as.mutation(api.sections.add, { groupId, name: 'TACO SHELF' }),
    ).rejects.toThrow(/SECTION_EXISTS/);
    await expect(ada.as.mutation(api.sections.add, { groupId, name: '  ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
  });

  test("a new section can't take a built-in section's name in either language", async () => {
    const { ada, groupId } = await family();
    for (const name of ['Dairy & eggs', 'meieri og egg']) {
      await expect(ada.as.mutation(api.sections.add, { groupId, name })).rejects.toThrow(
        /SECTION_EXISTS/,
      );
    }
    await ada.as.mutation(api.sections.rename, { groupId, key: 'dairy', name: 'Meieri' });
    await ada.as.mutation(api.sections.add, { groupId, name: 'Dairy & eggs' });
  });

  test('a family has at most 30 sections', async () => {
    const { ada, groupId } = await family();
    for (let i = 0; i < 30 - SECTIONS.length; i++) {
      await ada.as.mutation(api.sections.add, { groupId, name: `Section ${i}` });
    }
    await expect(ada.as.mutation(api.sections.add, { groupId, name: 'One more' })).rejects.toThrow(
      /TOO_MANY_SECTIONS/,
    );
  });

  test('renaming: built-in sections get their standard name back, own ones need a name', async () => {
    const { ada, groupId } = await family();
    await ada.as.mutation(api.sections.rename, { groupId, key: 'dry', name: 'Hermetikk' });
    expect((await sectionsOf(ada)).find((s) => s.key === 'dry')).toEqual({
      key: 'dry',
      name: 'Hermetikk',
    });
    await ada.as.mutation(api.sections.rename, { groupId, key: 'dry', name: '' });
    expect((await sectionsOf(ada)).find((s) => s.key === 'dry')).toEqual({ key: 'dry' });

    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await expect(ada.as.mutation(api.sections.rename, { groupId, key, name: '' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
    await ada.as.mutation(api.sections.rename, { groupId, key: 'other', name: 'Diverse' });
    await expect(
      ada.as.mutation(api.sections.rename, { groupId, key, name: 'diverse' }),
    ).rejects.toThrow(/SECTION_EXISTS/);
    await expect(
      ada.as.mutation(api.sections.rename, { groupId, key: 'nope', name: 'X' }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test('a new section pulls in the items jev says belong there, and leaves the rest', async () => {
    const { t, ada, groupId } = await family();
    const shells = await addItem(ada, groupId, 'Taco shells');
    const salsa = await addItem(ada, groupId, 'Salsa');
    const milk = await addItem(ada, groupId, 'Milk');
    const chips = await addItem(ada, groupId, 'Nachochips');
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: chips, section: 'dry' });
    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevPicks({
      'Taco shells': 'Taco shelf',
      Salsa: 'Taco shelf',
      Milk: 'Fruit, vegetables',
      Nachochips: 'Taco shelf',
    });
    vi.stubGlobal('fetch', fetchMock);
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Taco shelf' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await ingredient(t, shells)).toEqual([key, 'jev']);
    expect(await ingredient(t, salsa)).toEqual([key, 'jev']);
    // Not into the new section, so jev's answer is ignored; a member's choice is never asked about.
    expect(await ingredient(t, milk)).toEqual(['dairy', 'guess']);
    expect(await ingredient(t, chips)).toEqual(['dry', 'user']);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      state: { items: string[] };
    };
    expect(body.state.items.sort()).toEqual(['Milk', 'Salsa', 'Taco shells']);
  });

  test("deleting a section re-sorts its items, a member's choices included", async () => {
    const { t, ada, groupId } = await family();
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Taco shelf' });
    const salsa = await addItem(ada, groupId, 'Salsa');
    const cheese = await addItem(ada, groupId, 'Cheese');
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: salsa, section: key });
    await ada.as.mutation(api.ingredients.setSection, { ingredientId: cheese, section: key });
    await ada.as.mutation(api.sections.remove, { groupId, key: 'dairy' });
    expect((await sectionsOf(ada)).some((s) => s.key === 'dairy')).toBe(false);

    vi.useFakeTimers();
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const fetchMock = jevPicks({ Salsa: 'Pasta, rice', Cheese: 'Fruit, vegetables' }, 0.4);
    vi.stubGlobal('fetch', fetchMock);
    await ada.as.mutation(api.sections.remove, { groupId, key });
    // The keyword guess first: salsa is dry goods; cheese would be dairy, which is gone too.
    expect(await ingredient(t, salsa)).toEqual(['dry', 'guess']);
    expect(await ingredient(t, cheese)).toEqual(['other', 'guess']);
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.sectionOrder).not.toContain(key);
    expect(list.items.map((i) => i.section).sort()).toEqual(['dry', 'other']);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('lines saved under a deleted section show under Other', async () => {
    const { t, ada, groupId } = await family();
    const id = await addItem(ada, groupId, 'Salsa');
    await t.run(async (ctx) => {
      await ctx.db.patch('ingredients', id, { section: 'gone' });
      const items = await ctx.db.query('groceryItems').collect();
      await ctx.db.patch('groceryItems', items[0]._id, { section: 'gone' });
    });
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items[0].section).toBe('other');
  });

  test('Other cannot be deleted', async () => {
    const { ada, groupId } = await family();
    await expect(ada.as.mutation(api.sections.remove, { groupId, key: 'other' })).rejects.toThrow(
      /CANNOT_DELETE_OTHER/,
    );
    await expect(ada.as.mutation(api.sections.remove, { groupId, key: 'nope' })).rejects.toThrow(
      /NOT_FOUND/,
    );
  });

  test('reordering keeps sections the caller did not know about, and drops unknown keys', async () => {
    const { ada, groupId } = await family();
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await ada.as.mutation(api.sections.reorder, {
      groupId,
      keys: ['dairy', 'nope', 'dairy', 'produce', 'other'],
    });
    expect((await sectionsOf(ada)).map((s) => s.key)).toEqual([
      'dairy',
      'produce',
      'other',
      'meat',
      'bakery',
      'dry',
      'frozen',
      'household',
      key,
    ]);
    const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.sectionOrder.slice(0, 2)).toEqual(['dairy', 'produce']);
  });

  test('older app versions still set the store order', async () => {
    const { ada, groupId } = await family();
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    await ada.as.mutation(api.groups.setSectionOrder, { groupId, order: ['household', 'dairy'] });
    const me = (await ada.as.query(api.users.me, {}))!.family!;
    expect(me.sections.slice(0, 2).map((s) => s.key)).toEqual(['household', 'dairy']);
    expect(me.sections.some((s) => s.key === key)).toBe(true);
    expect(me.sectionOrder.slice(0, 2)).toEqual(['household', 'dairy']);
    expect(me.sectionOrder).not.toContain(key);
  });

  test('editing sections re-sorts at most the newest items, and leaves jev calls for new ones', async () => {
    const { t, ada, groupId } = await family();
    for (let i = 0; i < RESORT_ITEMS + 10; i++) {
      await ada.as.mutation(api.grocery.addManual, {
        groupId,
        startDate: MONDAY,
        name: `Item ${i}`,
      });
    }
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    let group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage?.count).toBe(RESORT_ITEMS / SORT_BATCH);
    // Same name in other letters: nothing to ask jev.
    await ada.as.mutation(api.sections.rename, { groupId, key, name: 'GRILL' });
    group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage?.count).toBe(RESORT_ITEMS / SORT_BATCH);

    const day = new Date().toISOString().slice(0, 10);
    await t.run((ctx) =>
      ctx.db.patch('groups', groupId, {
        jevUsage: { day, count: JEV_DAILY_LIMIT - JEV_RESERVE },
      }),
    );
    await ada.as.mutation(api.sections.add, { groupId, name: 'Baby' });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Halloumi' });
    group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.jevUsage?.count).toBe(JEV_DAILY_LIMIT - JEV_RESERVE + 1);
  });

  test("another family's sections are not found", async () => {
    const { t, ada, groupId } = await family();
    const bo = await signedInUser(t, 'Bo');
    await groupWithMembers(t, [bo.userId]);
    const key = await ada.as.mutation(api.sections.add, { groupId, name: 'Grill' });
    for (const call of [
      bo.as.mutation(api.sections.add, { groupId, name: 'Mine' }),
      bo.as.mutation(api.sections.rename, { groupId, key, name: 'Mine' }),
      bo.as.mutation(api.sections.remove, { groupId, key }),
      bo.as.mutation(api.sections.reorder, { groupId, keys: [] }),
    ]) {
      await expect(call).rejects.toThrow(/NOT_FOUND/);
    }
    expect((await sectionsOf(ada)).find((s) => s.key === key)).toEqual({ key, name: 'Grill' });
  });
});
