import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export type ItemSuggestion = FunctionReturnType<typeof api.ingredients.search>[number];

/** How long typing must pause before the family's items are searched again. */
export const SUGGEST_DELAY_MS = 150;

type Shown = { scope: unknown; items: ItemSuggestion[] };

/**
 * The family's items that match `text` (GRO-67), for the suggestion lists under the grocery add
 * field, recipe ingredient names and staples. The search waits for a short pause in typing, and
 * the last results stay up while the next ones load, so the list doesn't vanish and come back on
 * every keystroke. `scope` names the field being typed in (e.g. a recipe row): results found for
 * another field are never shown. An empty `text` shows nothing and forgets what was found.
 */
export function useItemSuggestions(
  groupId: Id<'groups'>,
  text: string,
  scope: unknown = null,
): ItemSuggestion[] {
  const wanted = text.trim();
  const [settled, setSettled] = useState<{ text: string; scope: unknown }>({ text: '', scope });
  const [kept, setKept] = useState<Shown | null>(null);

  // Clearing the field takes effect at once, so the next word starts from nothing.
  if (wanted === '' && (settled.text !== '' || kept !== null)) {
    setSettled({ text: '', scope });
    setKept(null);
  }

  useEffect(() => {
    if (wanted === '') return;
    const timer = setTimeout(() => setSettled({ text: wanted, scope }), SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted, scope]);

  const live = useQuery(
    api.ingredients.search,
    settled.text !== '' ? { groupId, text: settled.text } : 'skip',
  );
  if (
    wanted !== '' &&
    settled.text !== '' &&
    live !== undefined &&
    !(kept && kept.scope === settled.scope && sameItems(kept.items, live))
  ) {
    setKept({ scope: settled.scope, items: live });
  }

  if (wanted === '') return [];
  const shown =
    live !== undefined && settled.text !== '' ? { scope: settled.scope, items: live } : kept;
  return shown && shown.scope === scope ? shown.items : [];
}

function sameItems(a: ItemSuggestion[], b: ItemSuggestion[]) {
  return (
    a === b ||
    (a.length === b.length &&
      a.every(
        (item, i) =>
          item._id === b[i]._id &&
          item.name === b[i].name &&
          item.section === b[i].section &&
          item.defaultUnit === b[i].defaultUnit,
      ))
  );
}
