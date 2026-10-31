import { describe, expect, test } from 'vitest';

import { firstPicks, random, rankRecipes, swapPick, type RankInput } from './suggest';

const recipe = (id: string, fields: Partial<RankInput<string>> = {}): RankInput<string> => ({
  id,
  rating: null,
  daysBefore: null,
  daysAfter: null,
  inWeek: false,
  ...fields,
});

describe('rankRecipes', () => {
  test('leaves out dinners already in the week', () => {
    expect(rankRecipes([recipe('a', { inWeek: true }), recipe('b')], 1)).toEqual(['b']);
  });

  test('recent and disliked recipes come after all the others', () => {
    const ranked = rankRecipes(
      [
        recipe('recentFav', { rating: 5, daysBefore: 7 }),
        recipe('plannedSoon', { rating: 5, daysAfter: 3 }),
        recipe('disliked', { rating: 1.5, daysBefore: 90 }),
        recipe('ok', { rating: 3, daysBefore: 40 }),
        recipe('new'),
      ],
      7,
    );
    expect(new Set(ranked.slice(0, 2))).toEqual(new Set(['ok', 'new']));
    expect(new Set(ranked.slice(2))).toEqual(new Set(['recentFav', 'plannedSoon', 'disliked']));
  });

  test('a well-rated recipe not had for long beats a poorly rated one, whatever the seed', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ranked = rankRecipes(
        [
          recipe('meh', { rating: 2, daysBefore: 20 }),
          recipe('fav', { rating: 5, daysBefore: 60 }),
        ],
        seed,
      );
      expect(ranked[0]).toBe('fav');
    }
  });

  test('the seed changes the order of similar recipes', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      recipe(`r${i}`, { rating: 4, daysBefore: 30 }),
    );
    const orders = new Set(Array.from({ length: 5 }, (_, s) => rankRecipes(many, s).join()));
    expect(orders.size).toBeGreaterThan(1);
    expect(rankRecipes(many, 3)).toEqual(rankRecipes(many, 3));
  });
});

test('random is in [0, 1) and stable', () => {
  for (let i = 0; i < 100; i++) {
    const value = random(i, `id${i}`);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(random(i, `id${i}`)).toBe(value);
  }
});

describe('picks', () => {
  test('one ranked recipe per day, as far as they go', () => {
    expect(firstPicks(['mon', 'tue', 'wed'], 2)).toEqual({ mon: 0, tue: 1 });
  });

  test('swapping takes the next recipe no other day has, wrapping round', () => {
    const picks = { mon: 0, tue: 1 };
    expect(swapPick(picks, 'mon', 4)).toEqual({ mon: 2, tue: 1 });
    expect(swapPick({ mon: 3, tue: 0 }, 'mon', 4)).toEqual({ mon: 1, tue: 0 });
    // A skipped day comes back with the first free recipe.
    expect(swapPick({ tue: 0 }, 'mon', 3)).toEqual({
      mon: 1,
      tue: 0,
    });
    // Nothing else free: keep it.
    expect(swapPick(picks, 'mon', 2)).toEqual(picks);
  });
});
