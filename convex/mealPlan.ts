import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { loadForMember, requireMembership } from './lib/access';
import { normalizeName } from './lib/catalog';
import { detachEntry, findList, syncEntry } from './lib/groceryRows';
import { familyRatings } from './lib/ratings';
import { recipeIcon } from './lib/recipeIcons';
import { rankRecipes } from './lib/suggest';
import { addDays, isLocalDate, todayIn } from './lib/week';

/** At most this many ranked recipes go back to the app for one week's suggestions. */
const MAX_CANDIDATES = 30;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 3600 * 1000));
}

function validDate(date: string) {
  if (!isLocalDate(date)) throw new ConvexError({ code: 'INVALID_DATE' });
  return date;
}

function validServings(servings: number) {
  if (!Number.isInteger(servings) || servings < 1 || servings > 50) {
    throw new ConvexError({ code: 'INVALID_SERVINGS' });
  }
  return servings;
}

/**
 * The dinners of the 7 days from `startDate`, plus how many lines are still open on that
 * week's grocery list (lines of the same ingredient count once, as the list shows them).
 */
export const week = query({
  args: { groupId: v.id('groups'), startDate: v.string() },
  handler: async (ctx, { groupId, startDate }) => {
    await requireMembership(ctx, groupId);
    const endDate = addDays(validDate(startDate), 6);
    const entries = await ctx.db
      .query('mealPlanEntries')
      .withIndex('by_group_date', (q) =>
        q.eq('groupId', groupId).gte('date', startDate).lte('date', endDate),
      )
      .collect();
    const dinners = await Promise.all(
      entries.map(async (e) => {
        const recipe = e.recipeId ? await ctx.db.get('recipes', e.recipeId) : null;
        return {
          _id: e._id,
          date: e.date,
          recipeId: e.recipeId ?? null,
          title: recipe?.title ?? e.freeText ?? '',
          icon: recipe ? recipeIcon(recipe) : null,
          isNote: e.recipeId === undefined,
          servings: e.servings,
        };
      }),
    );

    const list = await findList(ctx, groupId, startDate);
    let openLines = 0;
    if (list !== null) {
      const items = await ctx.db
        .query('groceryItems')
        .withIndex('by_list', (q) => q.eq('listId', list._id))
        .collect();
      openLines = new Set(
        items
          .filter((i) => !i.checked && !i.atHome && !i.removed)
          .map((i) => i.ingredientId ?? normalizeName(i.name)),
      ).size;
    }
    return { dinners, openLines };
  },
});

/**
 * Plans the dinner for a date: a recipe (its ingredients go on that week's grocery list) or a
 * note such as "Leftovers". Replaces whatever was planned that day.
 */
export const set = mutation({
  args: {
    groupId: v.id('groups'),
    date: v.string(),
    recipeId: v.optional(v.id('recipes')),
    freeText: v.optional(v.string()),
    servings: v.optional(v.number()),
  },
  handler: async (ctx, { groupId, date, recipeId, freeText, servings }) => {
    const { userId } = await requireMembership(ctx, groupId);
    validDate(date);
    let entryServings = 4;
    let note: string | undefined;
    if (recipeId !== undefined) {
      const recipe = await ctx.db.get('recipes', recipeId);
      if (recipe === null || recipe.groupId !== groupId)
        throw new ConvexError({ code: 'NOT_FOUND' });
      entryServings = validServings(servings ?? recipe.servings);
    } else {
      note = freeText?.trim().slice(0, 80);
      if (!note) throw new ConvexError({ code: 'DINNER_REQUIRED' });
      entryServings = validServings(servings ?? 4);
    }

    const existing = await ctx.db
      .query('mealPlanEntries')
      .withIndex('by_group_date', (q) => q.eq('groupId', groupId).eq('date', date))
      .collect();
    for (const entry of existing) {
      await detachEntry(ctx, entry);
      await ctx.db.delete('mealPlanEntries', entry._id);
    }

    return await insertDinner(ctx, {
      groupId,
      date,
      recipeId,
      freeText: note,
      servings: entryServings,
      addedBy: userId,
    });
  },
});

/** Adds a dinner and puts its ingredients on that week's grocery list. */
async function insertDinner(
  ctx: MutationCtx,
  dinner: {
    groupId: Id<'groups'>;
    date: string;
    recipeId?: Id<'recipes'>;
    freeText?: string;
    servings: number;
    addedBy: Id<'users'>;
  },
) {
  const entryId = await ctx.db.insert('mealPlanEntries', {
    ...dinner,
    slot: 'dinner',
    createdAt: Date.now(),
  });
  await syncEntry(ctx, (await ctx.db.get('mealPlanEntries', entryId))!, dinner.addedBy);
  return entryId;
}

/**
 * Suggestions for the week from `startDate` (GRO-69): the days from today on that have no
 * dinner, and the family's recipes ranked for them, best first (well rated and not had
 * recently; see lib/suggest.ts). A new `seed` gives a different order.
 */
export const suggestions = query({
  args: { groupId: v.id('groups'), startDate: v.string(), seed: v.number() },
  handler: async (ctx, { groupId, startDate, seed }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const group = (await ctx.db.get('groups', groupId))!;
    const today = todayIn(group.timezone);
    const endDate = addDays(validDate(startDate), 6);
    const entries = await ctx.db
      .query('mealPlanEntries')
      .withIndex('by_group_date', (q) =>
        q.eq('groupId', groupId).gte('date', startDate).lte('date', endDate),
      )
      .collect();
    const planned = new Set(entries.map((e) => e.date));
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i)).filter(
      (d) => d >= today && !planned.has(d),
    );
    if (days.length === 0) return { days, candidates: [] };

    const recipes = (
      await ctx.db
        .query('recipes')
        .withIndex('by_group', (q) => q.eq('groupId', groupId))
        .collect()
    ).filter((r) => r.archivedAt === undefined);
    const ratingOf = await familyRatings(ctx, groupId, userId);
    const facts = await Promise.all(
      recipes.map(async (r) => {
        const before = await ctx.db
          .query('mealPlanEntries')
          .withIndex('by_recipe_date', (q) => q.eq('recipeId', r._id).lt('date', startDate))
          .order('desc')
          .first();
        const from = await ctx.db
          .query('mealPlanEntries')
          .withIndex('by_recipe_date', (q) => q.eq('recipeId', r._id).gte('date', startDate))
          .first();
        const cooked = await ctx.db
          .query('mealPlanEntries')
          .withIndex('by_recipe_date', (q) => q.eq('recipeId', r._id).lte('date', today))
          .order('desc')
          .first();
        const inWeek = from !== null && from.date <= endDate;
        let daysAfter: number | null = null;
        if (from !== null && !inWeek) daysAfter = daysBetween(endDate, from.date);
        return {
          recipe: r,
          rating: ratingOf(r._id).average,
          daysBefore: before ? daysBetween(before.date, startDate) : null,
          daysAfter,
          inWeek,
          lastCooked: cooked?.date ?? null,
        };
      }),
    );
    const byId = new Map(facts.map((f) => [f.recipe._id, f]));
    const ranked = rankRecipes(
      facts.map((f) => ({ ...f, id: f.recipe._id })),
      seed,
    ).slice(0, MAX_CANDIDATES);
    const candidates = ranked.map((id) => {
      const f = byId.get(id)!;
      return {
        recipeId: id,
        title: f.recipe.title,
        icon: recipeIcon(f.recipe),
        servings: f.recipe.servings,
        rating: f.rating,
        lastCooked: f.lastCooked,
      };
    });
    return { days, candidates };
  },
});

/**
 * Plans the suggested dinners the family kept. A day someone planned in the meantime is left
 * alone, so nobody's pick is replaced, and days before today are skipped. Returns how many
 * dinners were planned.
 */
export const planSuggested = mutation({
  args: {
    groupId: v.id('groups'),
    dinners: v.array(v.object({ date: v.string(), recipeId: v.id('recipes') })),
  },
  handler: async (ctx, { groupId, dinners }) => {
    const { userId } = await requireMembership(ctx, groupId);
    if (dinners.length > 7) throw new ConvexError({ code: 'TOO_LONG' });
    const dates = new Set(dinners.map((d) => validDate(d.date)));
    if (dates.size !== dinners.length) throw new ConvexError({ code: 'INVALID_DATE' });

    const group = (await ctx.db.get('groups', groupId))!;
    const today = todayIn(group.timezone);
    let planned = 0;
    for (const { date, recipeId } of dinners) {
      const recipe = await ctx.db.get('recipes', recipeId);
      if (recipe === null || recipe.groupId !== groupId)
        throw new ConvexError({ code: 'NOT_FOUND' });
      // Suggestions are for today on; an archived recipe is no longer offered.
      if (date < today || recipe.archivedAt !== undefined) continue;
      const taken = await ctx.db
        .query('mealPlanEntries')
        .withIndex('by_group_date', (q) => q.eq('groupId', groupId).eq('date', date))
        .first();
      if (taken !== null) continue;
      await insertDinner(ctx, {
        groupId,
        date,
        recipeId,
        servings: recipe.servings,
        addedBy: userId,
      });
      planned += 1;
    }
    return planned;
  },
});

/** Removes a planned dinner; its unchecked, unedited grocery lines leave the list. */
export const remove = mutation({
  args: { entryId: v.id('mealPlanEntries') },
  handler: async (ctx, { entryId }) => {
    const { doc } = await loadForMember(ctx, 'mealPlanEntries', entryId);
    await detachEntry(ctx, doc);
    await ctx.db.delete('mealPlanEntries', doc._id);
  },
});

/** Changes servings and rescales the dinner's open grocery lines. */
export const setServings = mutation({
  args: { entryId: v.id('mealPlanEntries'), servings: v.number() },
  handler: async (ctx, { entryId, servings }) => {
    const { doc, userId } = await loadForMember(ctx, 'mealPlanEntries', entryId);
    await ctx.db.patch('mealPlanEntries', doc._id, { servings: validServings(servings) });
    await syncEntry(ctx, (await ctx.db.get('mealPlanEntries', doc._id))!, userId);
  },
});
