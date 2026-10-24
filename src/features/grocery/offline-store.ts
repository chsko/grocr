import { ConvexError } from 'convex/values';

import type { KeyValueStore } from '@/lib/key-value-store';

// Offline support for the grocery list (GRO-18, decided in GRO-10): the last synced list for a
// week is saved on the device so it shows on a cold start with no signal, and check-offs are kept
// in a persisted queue until the server confirms them, so they survive the app being killed.
// `grocery.setChecked` sets absolute state, so resending a queued check-off is always safe.

export type CachedGroceryItem = {
  _id: string;
  name: string;
  qty?: number;
  unit?: string;
  section: string;
  checked: boolean;
};

export type CachedGroceryList = {
  groupId: string;
  startDate: string;
  items: CachedGroceryItem[];
  savedAt: number;
};

export type PendingCheck = { itemId: string; checked: boolean; queuedAt: number };

export type CheckBatch = { itemIds: string[]; checked: boolean };

/** Server limit on rows per `grocery.setChecked` call. */
export const MAX_BATCH = 100;

const PREFIX = 'grocery:v1';

function parse<T>(raw: string | undefined): T | undefined {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Everything is namespaced by the signed-in user so a shared device never shows one person's
 * cached list to another; call `clear()` on sign-out.
 */
export function createGroceryOfflineStore(kv: KeyValueStore, userId: string) {
  const ns = `${PREFIX}:${userId}`;
  const listKey = (groupId: string, startDate: string) => `${ns}:list:${groupId}:${startDate}`;
  const pendingKey = `${ns}:pending`;

  const readPending = () => parse<Record<string, PendingCheck>>(kv.getString(pendingKey)) ?? {};
  const writePending = (pending: Record<string, PendingCheck>) => {
    if (Object.keys(pending).length === 0) kv.remove(pendingKey);
    else kv.set(pendingKey, JSON.stringify(pending));
  };

  const saveList = (list: CachedGroceryList) =>
    kv.set(listKey(list.groupId, list.startDate), JSON.stringify(list));
  const loadList = (groupId: string, startDate: string) =>
    parse<CachedGroceryList>(kv.getString(listKey(groupId, startDate)));

  return {
    saveList,
    loadList,

    /** Writes local check-offs into the saved copy, so it stays right once they are confirmed. */
    updateCachedChecks(groupId: string, startDate: string, itemIds: string[], checked: boolean) {
      const list = loadList(groupId, startDate);
      if (!list) return;
      const ids = new Set(itemIds);
      saveList({
        ...list,
        items: list.items.map((item) => (ids.has(item._id) ? { ...item, checked } : item)),
      });
    },

    /** Records check-offs. A later tick of the same row replaces the earlier one. */
    queueChecks(itemIds: string[], checked: boolean, now = Date.now()) {
      const pending = readPending();
      for (const itemId of itemIds) pending[itemId] = { itemId, checked, queuedAt: now };
      writePending(pending);
    },

    pendingChecks(): PendingCheck[] {
      return Object.values(readPending()).sort((a, b) => a.queuedAt - b.queuedAt);
    },

    /**
     * Drops the given check-offs once the server confirmed them. An entry that was replaced by a
     * newer tick in the meantime stays queued.
     */
    acknowledge(sent: PendingCheck[]) {
      const pending = readPending();
      for (const entry of sent) {
        const current = pending[entry.itemId];
        if (current && current.checked === entry.checked && current.queuedAt === entry.queuedAt) {
          delete pending[entry.itemId];
        }
      }
      writePending(pending);
    },

    clear() {
      for (const key of kv.getAllKeys()) {
        if (key.startsWith(`${ns}:`)) kv.remove(key);
      }
    },
  };
}

export type GroceryOfflineStore = ReturnType<typeof createGroceryOfflineStore>;

/** Shows queued check-offs on top of the server or cached rows. */
export function applyPending<T extends { _id: string; checked: boolean }>(
  items: T[],
  pending: PendingCheck[],
): T[] {
  if (pending.length === 0) return items;
  const byId = new Map(pending.map((entry) => [entry.itemId, entry.checked]));
  return items.map((item) => {
    const checked = byId.get(item._id);
    return checked === undefined || checked === item.checked ? item : { ...item, checked };
  });
}

/** Groups queued check-offs into `setChecked` calls: one per state, at most MAX_BATCH rows each. */
export function toBatches(
  pending: PendingCheck[],
): { batch: CheckBatch; entries: PendingCheck[] }[] {
  const batches: { batch: CheckBatch; entries: PendingCheck[] }[] = [];
  for (const checked of [true, false]) {
    const entries = pending.filter((entry) => entry.checked === checked);
    for (let i = 0; i < entries.length; i += MAX_BATCH) {
      const chunk = entries.slice(i, i + MAX_BATCH);
      batches.push({
        batch: { itemIds: chunk.map((entry) => entry.itemId), checked },
        entries: chunk,
      });
    }
  }
  return batches;
}

/**
 * Sends every queued check-off and removes the ones the server confirmed. The Convex client holds
 * mutations while offline and retries transient failures itself, so a rejection is the server
 * refusing the change (e.g. the user left the family): those entries are dropped so they cannot
 * block the queue. Any other failure stops the flush and keeps the rest queued.
 * Returns whether the queue is empty.
 */
export async function flushPending(
  store: GroceryOfflineStore,
  send: (batch: CheckBatch) => Promise<unknown>,
): Promise<boolean> {
  for (const { batch, entries } of toBatches(store.pendingChecks())) {
    try {
      await send(batch);
    } catch (error) {
      if (!(error instanceof ConvexError)) return false;
    }
    store.acknowledge(entries);
  }
  return store.pendingChecks().length === 0;
}
