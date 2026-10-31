import { useEffect, useState } from 'react';

/** How long ids stay fresh after the last change, so a highlight has time to play once. */
const FRESH_MS = 2500;

type Seen = { scope: string; key: string; known: Set<string>; fresh: Set<string> };

const NONE: ReadonlySet<string> = new Set();

/**
 * The ids that showed up after `scope` first loaded: rows another member (or this device) added
 * while the screen was open. What was there on first sight, or when the scope changed, never
 * counts, so opening a list or stepping to another week does not light everything up.
 * Pass `undefined` while loading. Ids stop being fresh a moment after the last change, so a row
 * that later comes back (unticked from the cart) does not light up again.
 */
export function useFreshIds(
  scope: string,
  ids: readonly string[] | undefined,
): ReadonlySet<string> {
  const [seen, setSeen] = useState<Seen | null>(null);
  const fresh = seen?.fresh;
  useEffect(() => {
    if (!fresh || fresh.size === 0) return;
    const timer = setTimeout(
      () =>
        setSeen((current) =>
          current?.fresh === fresh ? { ...current, fresh: new Set() } : current,
        ),
      FRESH_MS,
    );
    return () => clearTimeout(timer);
  }, [fresh]);
  if (ids === undefined) return seen?.scope === scope ? seen.fresh : NONE;
  const key = ids.join(',');
  if (seen === null || seen.scope !== scope) {
    setSeen({ scope, key, known: new Set(ids), fresh: new Set() });
    return NONE;
  }
  if (seen.key !== key) {
    const added = ids.filter((id) => !seen.known.has(id));
    setSeen({
      scope,
      key,
      known: new Set([...seen.known, ...ids]),
      fresh: added.length > 0 ? new Set([...seen.fresh, ...added]) : seen.fresh,
    });
  }
  return seen.fresh;
}
