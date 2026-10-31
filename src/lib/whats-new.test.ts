import en from '@/lib/i18n/locales/en.json';
import nb from '@/lib/i18n/locales/nb.json';
import {
  entriesByDate,
  FIRST_LOOK,
  LATEST_WHATS_NEW,
  unseenEntries,
  WHATS_NEW,
} from '@/lib/whats-new';

describe("what's new entries", () => {
  test('are numbered 1, 2, 3… with no gaps, oldest first, dates never going back', () => {
    WHATS_NEW.forEach((entry, i) => {
      expect(entry.n).toBe(i + 1);
      if (i > 0) expect(entry.date >= WHATS_NEW[i - 1].date).toBe(true);
    });
    expect(LATEST_WHATS_NEW).toBe(WHATS_NEW.length);
  });

  test('every entry has a title and body in both languages, and keys are unique', () => {
    expect(new Set(WHATS_NEW.map((e) => e.key)).size).toBe(WHATS_NEW.length);
    for (const { key } of WHATS_NEW) {
      for (const lang of [en, nb]) {
        expect(lang.whatsNew.entries[key].title.length).toBeGreaterThan(0);
        expect(lang.whatsNew.entries[key].body.length).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(nb.whatsNew.entries).sort()).toEqual(
      Object.keys(en.whatsNew.entries).sort(),
    );
  });

  test('unseen: everything after the last seen, newest first', () => {
    expect(unseenEntries(LATEST_WHATS_NEW)).toEqual([]);
    expect(unseenEntries(LATEST_WHATS_NEW - 2).map((e) => e.n)).toEqual([
      LATEST_WHATS_NEW,
      LATEST_WHATS_NEW - 1,
    ]);
    // Seen a number this app version doesn't know yet (a newer phone): nothing to show.
    expect(unseenEntries(LATEST_WHATS_NEW + 3)).toEqual([]);
  });

  test("members from before What's new get only the few newest", () => {
    const first = unseenEntries(null);
    expect(first).toHaveLength(Math.min(FIRST_LOOK, WHATS_NEW.length));
    expect(first[0].n).toBe(LATEST_WHATS_NEW);
  });

  test('groups by ship date, newest day first', () => {
    const groups = entriesByDate([
      { n: 1, key: 'darkMode', date: '2026-10-25', icon: 'a' },
      { n: 2, key: 'atHome', date: '2026-10-25', icon: 'b' },
      { n: 3, key: 'items', date: '2026-10-31', icon: 'c' },
    ]);
    expect(groups.map((g) => [g.date, g.entries.map((e) => e.n)])).toEqual([
      ['2026-10-31', [3]],
      ['2026-10-25', [2, 1]],
    ]);
  });
});
