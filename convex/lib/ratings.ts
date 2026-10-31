import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

export const MIN_STARS = 1;
export const MAX_STARS = 5;

export function isStars(value: number) {
  return Number.isInteger(value) && value >= MIN_STARS && value <= MAX_STARS;
}

export type RecipeRating = {
  /** Family average to one decimal, or null when no current member has rated it. */
  average: number | null;
  count: number;
  /** The signed-in member's own stars. */
  mine: number | null;
};

const NO_RATING: RecipeRating = { average: null, count: 0, mine: null };

/** The family's current members, so ratings from people who left stop counting. */
export async function memberIds(ctx: QueryCtx, groupId: Id<'groups'>) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return new Set(memberships.map((m) => m.userId));
}

/** Every recipe's rating in the family, counting current members only. */
export async function familyRatings(
  ctx: QueryCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
): Promise<(recipeId: Id<'recipes'>) => RecipeRating> {
  const members = await memberIds(ctx, groupId);
  const rows = await ctx.db
    .query('recipeRatings')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  const sums = new Map<Id<'recipes'>, { sum: number; count: number; mine: number | null }>();
  for (const row of rows) {
    if (!members.has(row.userId)) continue;
    const entry = sums.get(row.recipeId) ?? { sum: 0, count: 0, mine: null };
    entry.sum += row.stars;
    entry.count += 1;
    if (row.userId === userId) entry.mine = row.stars;
    sums.set(row.recipeId, entry);
  }
  return (recipeId) => {
    const entry = sums.get(recipeId);
    if (entry === undefined) return NO_RATING;
    return { average: roundRating(entry.sum / entry.count), count: entry.count, mine: entry.mine };
  };
}

export function roundRating(value: number) {
  return Math.round(value * 10) / 10;
}
