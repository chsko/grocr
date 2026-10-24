import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { storage } from '@/lib/storage';

import {
  applyPending,
  createGroceryOfflineStore,
  flushPending,
  type CachedGroceryItem,
  type CheckBatch,
} from './offline-store';

export type GroceryListState = {
  items: CachedGroceryItem[];
  /** "live" from the server, "cache" from the device while offline, "loading" if neither yet. */
  source: 'live' | 'cache' | 'loading';
  savedAt?: number;
  isOnline: boolean;
  pendingCount: number;
  setChecked: (itemIds: string[], checked: boolean) => void;
};

/**
 * The grocery list for one week, readable and tickable offline (GRO-18 spike). While connected
 * it shows the live Convex query and saves each result to the device; on a cold start without
 * signal it shows the saved copy. Every tick goes into a persisted queue first and is removed once
 * the server confirms it, so check-offs survive the app being killed while offline.
 */
export function useGroceryList(
  userId: string,
  groupId: Id<'groups'>,
  startDate: string,
): GroceryListState {
  const store = useMemo(() => createGroceryOfflineStore(storage, userId), [userId]);
  const live = useQuery(api.grocery.listForWeek, { groupId, startDate });
  const [pending, setPending] = useState(() => store.pendingChecks());
  // Re-read after each queue change: local ticks are written into the saved copy too.
  const cached = useMemo(
    () => store.loadList(groupId, startDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, groupId, startDate, pending],
  );
  const { isWebSocketConnected } = useConvexConnectionState();

  const mutate = useMutation(api.grocery.setChecked).withOptimisticUpdate(
    (localStore, { itemIds, checked }) => {
      const current = localStore.getQuery(api.grocery.listForWeek, { groupId, startDate });
      if (!current) return;
      const ids = new Set<string>(itemIds);
      localStore.setQuery(
        api.grocery.listForWeek,
        { groupId, startDate },
        {
          ...current,
          items: current.items.map((item) => (ids.has(item._id) ? { ...item, checked } : item)),
        },
      );
    },
  );

  // One flush at a time; a tick during a flush asks for another round when it finishes.
  const flushing = useRef(false);
  const again = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current) {
      again.current = true;
      return;
    }
    flushing.current = true;
    try {
      do {
        again.current = false;
        await flushPending(store, (batch: CheckBatch) =>
          mutate({ itemIds: batch.itemIds as Id<'groceryItems'>[], checked: batch.checked }),
        );
      } while (again.current);
    } finally {
      flushing.current = false;
      setPending(store.pendingChecks());
    }
  }, [store, mutate]);

  // Resend anything left over from a previous session (e.g. the app was killed offline).
  useEffect(() => {
    void flush();
  }, [flush]);

  useEffect(() => {
    if (live === undefined || live === null) return;
    store.saveList({
      groupId,
      startDate,
      savedAt: Date.now(),
      items: live.items.map(({ _id, name, qty, unit, section, checked }) => ({
        _id,
        name,
        qty,
        unit,
        section,
        checked,
      })),
    });
  }, [live, store, groupId, startDate]);

  const setChecked = useCallback(
    (itemIds: string[], checked: boolean) => {
      store.queueChecks(itemIds, checked);
      store.updateCachedChecks(groupId, startDate, itemIds, checked);
      setPending(store.pendingChecks());
      void flush();
    },
    [store, flush, groupId, startDate],
  );

  const base = live !== undefined ? (live?.items ?? []) : cached?.items;
  return {
    items: applyPending(base ?? [], pending),
    source: live !== undefined ? 'live' : cached ? 'cache' : 'loading',
    savedAt: live !== undefined ? undefined : cached?.savedAt,
    isOnline: isWebSocketConnected,
    pendingCount: pending.length,
    setChecked,
  };
}
