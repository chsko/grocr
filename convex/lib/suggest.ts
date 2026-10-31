// "Suggest a week" (GRO-69): rank the family's recipes for the empty days of a week. Shared by
// the server, which ranks, and the app, which hands the ranked list out to days and swaps.

/** A recipe made or planned this close to the week is too recent to suggest (days). */
export const RECENT_DAYS = 14;
/** A family average below this means they don't like it much. */
export const DISLIKED_BELOW = 2;
/** What an unrated recipe counts as. */
export const UNRATED = 3;
/** Days since last made stop adding to the score after this. */
const DAYS_CAP = 60;
/** What a never-made recipe counts as, so new recipes get tried without taking over. */
const NEVER_MADE_DAYS = 30;
/** How much randomness Shuffle adds; about one and a half stars. */
const JITTER = 1.5;

export type RankInput<Id extends string> = {
  id: Id;
  /** Family average, or null when nobody has rated it. */
  rating: number | null;
  /** Days from the recipe's last dinner before the week to the week's first day; null if none. */
  daysBefore: number | null;
  /** Days from the week's last day to the recipe's next dinner after it; null if none. */
  daysAfter: number | null;
  /** It is already planned on a day of this week. */
  inWeek: boolean;
};

/**
 * Best first. Recipes already in the week are left out. Recipes had recently or rated low come
 * after all the others, so they are only suggested when nothing else is left. Within each group
 * the score is the rating, plus a little for every day since it was last made, plus a seeded
 * random nudge so a new seed gives a different order.
 */
export function rankRecipes<Id extends string>(recipes: RankInput<Id>[], seed: number): Id[] {
  return recipes
    .filter((r) => !r.inWeek)
    .map((r) => {
      const recent =
        (r.daysBefore !== null && r.daysBefore <= RECENT_DAYS) ||
        (r.daysAfter !== null && r.daysAfter <= RECENT_DAYS);
      const disliked = r.rating !== null && r.rating < DISLIKED_BELOW;
      const days = Math.min(r.daysBefore ?? NEVER_MADE_DAYS, DAYS_CAP);
      const score = (r.rating ?? UNRATED) + days / 20 + JITTER * random(seed, r.id);
      return { id: r.id, fallback: recent || disliked, score };
    })
    .sort((a, b) => Number(a.fallback) - Number(b.fallback) || b.score - a.score)
    .map((r) => r.id);
}

/** A number in [0, 1) that depends only on the seed and the id. */
export function random(seed: number, id: string) {
  // FNV-1a over the id, mixed with the seed, then a round of mulberry32.
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Which ranked recipe (by index) each day has. SKIPPED marks a day the family skipped; a day
 * missing had no recipe left for it.
 */
export type Picks = Partial<Record<string, number>>;
export const SKIPPED = -1;

/** The first suggestion for each day: the ranked recipes in order, one per day. */
export function firstPicks(days: string[], ranked: number) {
  const picks: Picks = {};
  days.forEach((day, index) => {
    if (index < ranked) picks[day] = index;
  });
  return picks;
}

/**
 * Swaps a day's suggestion for the next ranked recipe no other day has, wrapping round. Keeps
 * the current one when every other recipe is taken.
 */
export function swapPick(picks: Picks, day: string, ranked: number): Picks {
  const taken = new Set(
    Object.entries(picks)
      .filter(([d, i]) => d !== day && i !== undefined)
      .map(([, i]) => i as number),
  );
  const current = picks[day] ?? -1;
  for (let step = 1; step <= ranked; step++) {
    const next = (current + step) % ranked;
    if (!taken.has(next)) return { ...picks, [day]: next };
  }
  return picks;
}
