import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { storage } from '@/lib/storage';

import {
  applyPending,
  createGroceryOfflineStore,
  flushPending,
  type CachedGroceryItem,
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

/** One flush loop per user at a time, shared by every screen using the hook. */
const flushes = new Map<string, { running: boolean; again: boolean }>();

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
  const { isAuthenticated } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();

  // Bumped whenever the persisted queue changes; the queue itself is read from the store.
  const [queueVersion, queueChanged] = useReducer((n: number) => n + 1, 0);
  const pending = useMemo(
    () => store.pendingChecks(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, queueVersion],
  );
  // Local ticks are written into the saved copy too, so re-read it when the queue changes.
  const cached = useMemo(
    () => store.loadList(groupId, startDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, groupId, startDate, queueVersion],
  );

  const setCheckedMutation = useMutation(api.grocery.setChecked);
  const mutate = useMemo(
    () =>
      setCheckedMutation.withOptimisticUpdate((localStore, { itemIds, checked }) => {
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
      }),
    [setCheckedMutation, groupId, startDate],
  );
  const mutateRef = useRef(mutate);
  const activeUser = useRef(userId);
  useEffect(() => {
    mutateRef.current = mutate;
    activeUser.current = userId;
  }, [mutate, userId]);

  const flush = useCallback(async () => {
    const state = flushes.get(userId) ?? { running: false, again: false };
    flushes.set(userId, state);
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        await flushPending(store, async (batch) => {
          // Never send one user's queue under another user's session.
          if (activeUser.current !== userId) throw new Error('Signed-in user changed');
          await mutateRef.current({
            itemIds: batch.itemIds as Id<'groceryItems'>[],
            checked: batch.checked,
          });
        });
        queueChanged();
      } while (state.again);
    } finally {
      state.running = false;
    }
  }, [store, userId]);

  // Resend leftovers (e.g. the app was killed offline) once auth is ready, and on every reconnect.
  useEffect(() => {
    if (isAuthenticated && isWebSocketConnected) void flush();
  }, [flush, isAuthenticated, isWebSocketConnected]);

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
      queueChanged();
      if (isAuthenticated) void flush();
    },
    [store, flush, groupId, startDate, isAuthenticated],
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

/** Removes a user's cached lists and unsent ticks. Call on sign-out (GRO-22). */
export function clearGroceryOfflineData(userId: string) {
  createGroceryOfflineStore(storage, userId).clear();
  flushes.delete(userId);
}
