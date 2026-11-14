import { useMutation } from 'convex/react';
import type { OptimisticUpdate } from 'convex/browser';
import type { FunctionArgs } from 'convex/server';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { cleanName, guessSection, normalizeName, placeSection } from '@/convex/lib/catalog';

/**
 * Optimistic updates: what a tap changes shows at once instead of after the server's round trip
 * (a short but visible delay). The server's answer replaces them, and a failed mutation rolls
 * them back.
 */

/** Id prefix of a staple shown before the server has made or found its item. */
const PENDING = 'pending:';

export function isPendingStaple(id: string) {
  return id.startsWith(PENDING);
}

/** An item moved to another section, wherever it is on screen: grocery lists, Items, staples. */
export const setSectionUpdate: OptimisticUpdate<FunctionArgs<typeof api.ingredients.setSection>> = (
  store,
  { ingredientId, section },
) => {
  for (const { args, value } of store.getAllQueries(api.grocery.listForWeek)) {
    if (!value) continue;
    store.setQuery(api.grocery.listForWeek, args, {
      ...value,
      items: value.items.map((i) => (i.ingredientId === ingredientId ? { ...i, section } : i)),
    });
  }
  for (const { args, value } of store.getAllQueries(api.ingredients.list)) {
    if (!value) continue;
    store.setQuery(
      api.ingredients.list,
      args,
      value.map((i) => (i._id === ingredientId ? { ...i, section } : i)),
    );
  }
  for (const { args, value } of store.getAllQueries(api.staples.list)) {
    if (!value) continue;
    store.setQuery(
      api.staples.list,
      args,
      value.map((i) => (i._id === ingredientId ? { ...i, section } : i)),
    );
  }
};

/**
 * An item made a staple or not: the "Kjøpes hver uke" chip on a grocery line, the staples list,
 * and (when it stops being one) the lists' staples offer.
 */
export const setStapleUpdate: OptimisticUpdate<FunctionArgs<typeof api.staples.set>> = (
  store,
  { ingredientId, staple },
) => {
  for (const { args, value } of store.getAllQueries(api.grocery.listForWeek)) {
    if (!value) continue;
    const others = value.stapleIds.filter((id) => id !== ingredientId);
    store.setQuery(api.grocery.listForWeek, args, {
      ...value,
      stapleIds: staple ? [...others, ingredientId] : others,
      staplesOffer: staple
        ? value.staplesOffer
        : value.staplesOffer.filter((s) => s.ingredientId !== ingredientId),
    });
  }
  if (staple) return;
  for (const { args, value } of store.getAllQueries(api.staples.list)) {
    if (!value) continue;
    store.setQuery(
      api.staples.list,
      args,
      value.filter((i) => i._id !== ingredientId),
    );
  }
};

/**
 * A staple added from the staples screen shows in its list at once. A picked item takes its name
 * and section from `picked` or the loaded suggestions; a typed name gets a placeholder id and the section the
 * server would guess (`sectionKeys` are the family's).
 */
export function addStapleUpdate(
  sectionKeys: readonly string[],
  /** Items picked by tap, by id: the field is cleared then, so their search may be gone. */
  picked: ReadonlyMap<string, { name: string; section: string }> = new Map(),
): OptimisticUpdate<FunctionArgs<typeof api.staples.add>> {
  return (store, { groupId, name, ingredientId }) => {
    const current = store.getQuery(api.staples.list, { groupId });
    if (!current) return;
    if (ingredientId !== undefined && current.some((s) => s._id === ingredientId)) return;
    const known =
      ingredientId === undefined
        ? undefined
        : (picked.get(ingredientId) ??
          store
            .getAllQueries(api.ingredients.search)
            .flatMap((q) => q.value ?? [])
            .find((m) => m._id === ingredientId));
    const clean = cleanName(name);
    store.setQuery(api.staples.list, { groupId }, [
      ...current,
      {
        _id: ingredientId ?? (`${PENDING}${normalizeName(name)}` as Id<'ingredients'>),
        name: known?.name ?? clean,
        section: placeSection(known?.section ?? guessSection(clean), sectionKeys),
      },
    ]);
  };
}

export function useSetSection() {
  return useMutation(api.ingredients.setSection).withOptimisticUpdate(setSectionUpdate);
}

export function useSetStaple() {
  return useMutation(api.staples.set).withOptimisticUpdate(setStapleUpdate);
}
