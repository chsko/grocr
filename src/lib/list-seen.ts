import { useMutation } from 'convex/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

/** What `newSince` needs to know about a grocery row. */
export type SeenRow = {
  _id: string;
  createdAt?: number;
  byOther?: boolean;
  checked: boolean;
  atHome?: boolean;
};

const NONE: ReadonlySet<string> = new Set();

/**
 * The rows someone else put on the list after `since` (GRO-70) that are still to buy. Nothing
 * counts when `since` is null: a member who never looked at a list has nothing to compare with,
 * and marking the whole list as new would say nothing.
 */
export function newSince(rows: readonly SeenRow[], since: number | null): ReadonlySet<string> {
  if (since === null) return NONE;
  const ids = rows
    .filter(
      (r) =>
        r.byOther === true &&
        r.createdAt !== undefined &&
        r.createdAt > since &&
        !r.checked &&
        !r.atHome,
    )
    .map((r) => r._id);
  return ids.length > 0 ? new Set(ids) : NONE;
}

/**
 * Whether the app is open. iOS goes "inactive" for a glance at Control Center or the app
 * switcher; only going to the background ends a visit.
 */
function useAppOpen() {
  const [open, setOpen] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setOpen(state !== 'background'));
    return () => sub.remove();
  }, []);
  return open;
}

/** What `useSeenSince` needs from the week's list; undefined while it loads. */
export type SeenList = {
  items: readonly SeenRow[];
  /** Missing on a backend from before GRO-70, which cannot remember anything. */
  seenAt?: number | null;
  lastSeenAt?: number | null;
};

type Visit = {
  groupId: string;
  /** The member's last look at any family list when this visit began, for weeks never opened. */
  baseline: number | null;
  /** Per week, what had been seen when this visit first showed it. */
  weeks: Readonly<Record<string, number | null>>;
};

/**
 * What the member had seen of the week's list before this visit, so the screen can mark rows
 * added after it (GRO-70). A visit lasts while the Groceries tab is in front and the app is open;
 * the value is caught once per week at the start and kept until the visit ends, so the marks stay
 * put while the member reads. A week they never opened compares with their last look at any
 * family list as it was when the visit began, not with a look this visit has just recorded.
 * While visible, the server hears the newest row shown, so the next visit starts from there.
 * Returns null when there is nothing to compare with.
 */
export function useSeenSince(
  groupId: Id<'groups'>,
  startDate: string,
  data: SeenList | undefined,
): number | null {
  const focused = useIsFocused();
  const open = useAppOpen();
  const visible = focused && open;
  const markSeen = useMutation(api.grocery.markSeen);
  const supported = data !== undefined && data.lastSeenAt !== undefined;

  const [visit, setVisit] = useState<Visit | null>(null);
  if (!visible) {
    if (visit !== null) setVisit(null);
  } else if (supported) {
    const current = visit?.groupId === groupId ? visit : null;
    if (current === null || !(startDate in current.weeks)) {
      const baseline = current ? current.baseline : (data.lastSeenAt ?? null);
      setVisit({
        groupId,
        baseline,
        weeks: { ...current?.weeks, [startDate]: data.seenAt ?? baseline },
      });
    }
  }
  const caught = visible && visit?.groupId === groupId && startDate in visit.weeks;

  // The newest row on screen; everything up to it has been seen.
  const upTo =
    caught && supported
      ? data.items.reduce<number | null>(
          (max, r) =>
            r.createdAt !== undefined && (max === null || r.createdAt > max) ? r.createdAt : max,
          null,
        )
      : null;
  useEffect(() => {
    if (upTo === null) return;
    void markSeen({ groupId, startDate, upTo }).catch(() => {});
  }, [upTo, groupId, startDate, markSeen]);

  return caught ? visit.weeks[startDate] : null;
}
