import type { Href } from 'expo-router';

import type en from '@/lib/i18n/locales/en.json';
import type { LocalDate } from '@/lib/week';

/**
 * Hand-written "What's new" entries (GRO-66), one per change a family would notice. Add one
 * with every user-visible feature: give it the next number, put it last, and add its title and
 * body under `whatsNew.entries.<key>` in both en.json and nb.json. Never renumber; the server
 * remembers the highest number each member has seen.
 */
export type WhatsNewEntry = {
  n: number;
  key: keyof typeof en.whatsNew.entries;
  date: LocalDate;
  icon: string;
  /** Where "Show me" goes; leave out when there is nowhere better than the sheet itself. */
  href?: Href;
};

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { n: 1, key: 'darkMode', date: '2026-10-25', icon: '🌙' },
  { n: 2, key: 'atHome', date: '2026-10-25', icon: '🏠', href: '/groceries' },
  { n: 3, key: 'items', date: '2026-10-31', icon: '🏷️', href: '/items' },
  { n: 4, key: 'staples', date: '2026-10-31', icon: '🥛', href: '/staples' },
  { n: 5, key: 'typeAhead', date: '2026-10-31', icon: '🔎', href: '/groceries' },
  { n: 6, key: 'ratings', date: '2026-10-31', icon: '⭐', href: '/recipes' },
  { n: 7, key: 'dinnerIdeas', date: '2026-10-31', icon: '💡', href: '/week' },
  { n: 8, key: 'newSince', date: '2026-11-06', icon: '✨', href: '/groceries' },
  { n: 9, key: 'recipeLink', date: '2026-11-06', icon: '🔗', href: '/recipes' },
];

export const LATEST_WHATS_NEW = WHATS_NEW.reduce((max, e) => Math.max(max, e.n), 0);

/** How many recent entries someone sees who has never opened What's new (members from before it). */
export const FIRST_LOOK = 3;

/**
 * The entries to show by themselves after an update, newest first: everything after the last
 * one they saw, or the few newest for members who joined before What's new existed.
 */
export function unseenEntries(
  seen: number | null | undefined,
  entries: readonly WhatsNewEntry[] = WHATS_NEW,
): WhatsNewEntry[] {
  const newestFirst = [...entries].sort((a, b) => b.n - a.n);
  // undefined: a backend from before GRO-66. It can't record what was seen, so showing
  // anything would repeat on every start; like the tour, only an explicit null counts.
  if (seen === undefined) return [];
  if (seen === null) return newestFirst.slice(0, FIRST_LOOK);
  return newestFirst.filter((e) => e.n > seen);
}

/** All entries, newest first, grouped by the day they shipped. */
export function entriesByDate(entries: readonly WhatsNewEntry[] = WHATS_NEW) {
  const groups: { date: LocalDate; entries: WhatsNewEntry[] }[] = [];
  for (const entry of [...entries].sort((a, b) => b.n - a.n)) {
    const last = groups.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }
  return groups;
}
