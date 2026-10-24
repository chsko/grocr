import { ConvexError } from 'convex/values';

import { memoryStore } from '@/lib/key-value-store';

import {
  applyPending,
  createGroceryOfflineStore,
  flushPending,
  MAX_BATCH,
  toBatches,
  type CachedGroceryList,
} from './offline-store';

const list: CachedGroceryList = {
  groupId: 'g1',
  startDate: '2026-10-26',
  savedAt: 1,
  items: [
    { _id: 'a', name: 'Milk', section: 'Dairy', checked: false },
    { _id: 'b', name: 'Onion', section: 'Produce', checked: true },
  ],
};

describe('grocery offline store', () => {
  test('a saved list survives a restart (new store on the same storage)', () => {
    const kv = memoryStore();
    createGroceryOfflineStore(kv, 'u1').saveList(list);
    expect(createGroceryOfflineStore(kv, 'u1').loadList('g1', '2026-10-26')).toEqual(list);
  });

  test("one user never sees another user's cache or queue", () => {
    const kv = memoryStore();
    const ada = createGroceryOfflineStore(kv, 'ada');
    ada.saveList(list);
    ada.queueChecks(['a'], true);
    const eve = createGroceryOfflineStore(kv, 'eve');
    expect(eve.loadList('g1', '2026-10-26')).toBeUndefined();
    expect(eve.pendingChecks()).toEqual([]);
  });

  test('clear removes only that user’s data', () => {
    const kv = memoryStore();
    const ada = createGroceryOfflineStore(kv, 'ada');
    const bob = createGroceryOfflineStore(kv, 'bob');
    ada.saveList(list);
    ada.queueChecks(['a'], true);
    bob.saveList(list);
    ada.clear();
    expect(ada.loadList('g1', '2026-10-26')).toBeUndefined();
    expect(ada.pendingChecks()).toEqual([]);
    expect(bob.loadList('g1', '2026-10-26')).toEqual(list);
  });

  test('corrupt storage is treated as empty', () => {
    const kv = memoryStore();
    kv.set('grocery:v1:u1:pending', '{not json');
    expect(createGroceryOfflineStore(kv, 'u1').pendingChecks()).toEqual([]);
  });

  test('the last tick of a row wins and is shown over the cached state', () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a', 'b'], true, 1);
    store.queueChecks(['b'], false, 2);
    const pending = store.pendingChecks();
    expect(pending).toEqual([
      { itemId: 'a', checked: true, queuedAt: 1 },
      { itemId: 'b', checked: false, queuedAt: 2 },
    ]);
    expect(applyPending(list.items, pending).map((item) => item.checked)).toEqual([true, false]);
  });

  test('acknowledging keeps entries that were re-ticked meanwhile', () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a'], true, 1);
    const sent = store.pendingChecks();
    store.queueChecks(['a'], false, 2); // ticked again while the first send was in flight
    store.acknowledge(sent);
    expect(store.pendingChecks()).toEqual([{ itemId: 'a', checked: false, queuedAt: 2 }]);
  });

  test('batches split by state and size', () => {
    const ids = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `i${i}`);
    const pending = [
      ...ids.map((itemId) => ({ itemId, checked: true, queuedAt: 1 })),
      { itemId: 'x', checked: false, queuedAt: 1 },
    ];
    expect(toBatches(pending).map(({ batch }) => [batch.checked, batch.itemIds.length])).toEqual([
      [true, MAX_BATCH],
      [true, 1],
      [false, 1],
    ]);
  });
});

describe('flushPending', () => {
  test('sends everything and empties the queue', async () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a'], true);
    store.queueChecks(['b'], false);
    const send = jest.fn().mockResolvedValue(1);
    await expect(flushPending(store, send)).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.pendingChecks()).toEqual([]);
  });

  test('keeps a batch the server rejects for a transient reason and still sends the rest', async () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a'], true);
    store.queueChecks(['b'], false);
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce(1);
    await expect(flushPending(store, send)).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.pendingChecks().map((entry) => entry.itemId)).toEqual(['a']);
  });

  test('keeps check-offs refused only because auth was not ready yet', async () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a'], true);
    const send = jest.fn().mockRejectedValue(new ConvexError({ code: 'UNAUTHENTICATED' }));
    await expect(flushPending(store, send)).resolves.toBe(false);
    expect(store.pendingChecks()).toHaveLength(1);
  });

  test('drops check-offs the server refuses so they cannot block the queue', async () => {
    const store = createGroceryOfflineStore(memoryStore(), 'u1');
    store.queueChecks(['a'], true);
    store.queueChecks(['b'], false);
    const send = jest
      .fn()
      .mockRejectedValueOnce(new ConvexError({ code: 'NOT_FOUND' }))
      .mockResolvedValueOnce(1);
    await expect(flushPending(store, send)).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

test('local ticks are written into the saved copy', () => {
  const store = createGroceryOfflineStore(memoryStore(), 'u1');
  store.saveList(list);
  store.updateCachedChecks('g1', '2026-10-26', ['a'], true);
  store.updateCachedChecks('g1', '2099-01-05', ['a'], true); // no saved copy: ignored
  expect(store.loadList('g1', '2026-10-26')?.items.map((item) => item.checked)).toEqual([
    true,
    true,
  ]);
});
