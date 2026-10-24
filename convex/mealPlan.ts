import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { loadForMember, requireMembership } from './lib/access';
import { normalizeName } from './lib/catalog';
import { detachEntry, findList, syncEntry } from './lib/groceryRows';
import { addDays, isLocalDate } from './lib/week';
import { recipeIcon } from './lib/recipeIcons';

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
          .filter((i) => !i.checked && !i.removed)
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

    const entryId = await ctx.db.insert('mealPlanEntries', {
      groupId,
      date,
      slot: 'dinner',
      recipeId,
      freeText: note,
      servings: entryServings,
      addedBy: userId,
      createdAt: Date.now(),
    });
    await syncEntry(ctx, (await ctx.db.get('mealPlanEntries', entryId))!);
    return entryId;
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
    const { doc } = await loadForMember(ctx, 'mealPlanEntries', entryId);
    await ctx.db.patch('mealPlanEntries', doc._id, { servings: validServings(servings) });
    await syncEntry(ctx, (await ctx.db.get('mealPlanEntries', doc._id))!);
  },
});
