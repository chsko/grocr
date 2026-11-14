import type { OptimisticLocalStore } from 'convex/browser';
import { getFunctionName, type FunctionReference } from 'convex/server';

import { addStapleUpdate, isPendingStaple, setSectionUpdate, setStapleUpdate } from './optimistic';
import { api } from '@/convex/_generated/api';

/** A tiny local query store, enough for the updates under test. */
function fakeStore(entries: [FunctionReference<'query'>, Record<string, unknown>, unknown][]) {
  const data = new Map<string, { name: string; args: Record<string, unknown>; value: unknown }>();
  const key = (q: FunctionReference<'query'>, args: unknown) =>
    `${getFunctionName(q)}|${JSON.stringify(args)}`;
  for (const [q, args, value] of entries) {
    data.set(key(q, args), { name: getFunctionName(q), args, value });
  }
  const store = {
    getQuery: (q: FunctionReference<'query'>, args: unknown) => data.get(key(q, args))?.value,
    getAllQueries: (q: FunctionReference<'query'>) =>
      [...data.values()].filter((e) => e.name === getFunctionName(q)),
    setQuery: (q: FunctionReference<'query'>, args: Record<string, unknown>, value: unknown) => {
      data.set(key(q, args), { name: getFunctionName(q), args, value });
    },
  };
  return {
    store: store as unknown as OptimisticLocalStore,
    get: (q: FunctionReference<'query'>, args: unknown) => data.get(key(q, args))?.value as any,
  };
}

const week = { groupId: 'g1', startDate: '2026-11-09' };
const list = (items: object[], extra: object = {}) => ({
  listId: 'l1',
  items,
  stapleIds: [],
  staplesOffer: [],
  ...extra,
});

describe('setSectionUpdate', () => {
  it('moves the item on every loaded list, the Items screen and staples', () => {
    const next = { groupId: 'g1', startDate: '2026-11-16' };
    const { store, get } = fakeStore([
      [
        api.grocery.listForWeek,
        week,
        list([
          { _id: 'r1', ingredientId: 'milk', section: 'other' },
          { _id: 'r2', ingredientId: 'bread', section: 'bakery' },
        ]),
      ],
      [
        api.grocery.listForWeek,
        next,
        list([{ _id: 'r3', ingredientId: 'milk', section: 'other' }]),
      ],
      [api.ingredients.list, { groupId: 'g1' }, [{ _id: 'milk', section: 'other' }]],
      [api.staples.list, { groupId: 'g1' }, [{ _id: 'milk', name: 'Melk', section: 'other' }]],
    ]);
    setSectionUpdate(store, { ingredientId: 'milk' as never, section: 'dairy' });
    expect(get(api.grocery.listForWeek, week).items.map((i: any) => i.section)).toEqual([
      'dairy',
      'bakery',
    ]);
    expect(get(api.grocery.listForWeek, next).items[0].section).toBe('dairy');
    expect(get(api.ingredients.list, { groupId: 'g1' })[0].section).toBe('dairy');
    expect(get(api.staples.list, { groupId: 'g1' })[0].section).toBe('dairy');
  });
});

describe('setStapleUpdate', () => {
  it('marks the line as a staple at once', () => {
    const { store, get } = fakeStore([[api.grocery.listForWeek, week, list([])]]);
    setStapleUpdate(store, { ingredientId: 'milk' as never, staple: true });
    expect(get(api.grocery.listForWeek, week).stapleIds).toEqual(['milk']);
  });

  it('takes a removed staple off the lists, the offer and the staples screen', () => {
    const { store, get } = fakeStore([
      [
        api.grocery.listForWeek,
        week,
        list([], {
          stapleIds: ['milk', 'bread'],
          staplesOffer: [{ ingredientId: 'milk', name: 'Melk' }],
        }),
      ],
      [
        api.staples.list,
        { groupId: 'g1' },
        [
          { _id: 'milk', name: 'Melk', section: 'dairy' },
          { _id: 'bread', name: 'Brød', section: 'bakery' },
        ],
      ],
    ]);
    setStapleUpdate(store, { ingredientId: 'milk' as never, staple: false });
    const l = get(api.grocery.listForWeek, week);
    expect(l.stapleIds).toEqual(['bread']);
    expect(l.staplesOffer).toEqual([]);
    expect(get(api.staples.list, { groupId: 'g1' }).map((s: any) => s._id)).toEqual(['bread']);
  });
});

describe('addStapleUpdate', () => {
  const keys = ['produce', 'dairy', 'bakery', 'other'];

  it('shows a picked item with its name and section from the suggestions', () => {
    const { store, get } = fakeStore([
      [api.staples.list, { groupId: 'g1' }, []],
      [
        api.ingredients.search,
        { groupId: 'g1', text: 'mel' },
        [{ _id: 'milk', name: 'Melk', section: 'dairy' }],
      ],
    ]);
    addStapleUpdate(keys)(store, {
      groupId: 'g1' as never,
      name: 'Melk',
      ingredientId: 'milk' as never,
    });
    expect(get(api.staples.list, { groupId: 'g1' })).toEqual([
      { _id: 'milk', name: 'Melk', section: 'dairy' },
    ]);
  });

  it('uses the section of a picked item even when its search is gone', () => {
    const { store, get } = fakeStore([[api.staples.list, { groupId: 'g1' }, []]]);
    const picked = new Map([['milk', { name: 'Melk', section: 'dairy' }]]);
    addStapleUpdate(keys, picked)(store, {
      groupId: 'g1' as never,
      name: 'Melk',
      ingredientId: 'milk' as never,
    });
    expect(get(api.staples.list, { groupId: 'g1' })[0].section).toBe('dairy');
  });

  it('shows a typed name under a placeholder id with a guessed section', () => {
    const { store, get } = fakeStore([[api.staples.list, { groupId: 'g1' }, []]]);
    addStapleUpdate(keys)(store, { groupId: 'g1' as never, name: '  Melk ' });
    const [row] = get(api.staples.list, { groupId: 'g1' });
    expect(isPendingStaple(row._id)).toBe(true);
    expect(row.name).toBe('Melk');
    expect(keys).toContain(row.section);
  });

  it('does not add an item that is already a staple twice', () => {
    const milk = { _id: 'milk', name: 'Melk', section: 'dairy' };
    const { store, get } = fakeStore([[api.staples.list, { groupId: 'g1' }, [milk]]]);
    addStapleUpdate(keys)(store, {
      groupId: 'g1' as never,
      name: 'Melk',
      ingredientId: 'milk' as never,
    });
    expect(get(api.staples.list, { groupId: 'g1' })).toEqual([milk]);
  });
});
