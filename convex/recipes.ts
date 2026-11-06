import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { scheduleIconGuess } from './classify';
import { resolveIngredient } from './ingredients';
import { loadForMember, requireMembership } from './lib/access';
import { cleanName } from './lib/catalog';
import { familyRatings, isStars, memberIds, roundRating } from './lib/ratings';
import { syncEntry } from './lib/groceryRows';
import { DEFAULT_ICON, guessIcon, isRecipeIcon, recipeIcon } from './lib/recipeIcons';
import { isUnit } from './lib/units';
import { todayIn } from './lib/week';

const MAX_INGREDIENTS = 60;
const MAX_STEPS = 40;

/** When the recipe was last on the menu up to today, and the next time it is planned. */
async function planDates(ctx: QueryCtx, recipeId: Id<'recipes'>, today: string) {
  const last = await ctx.db
    .query('mealPlanEntries')
    .withIndex('by_recipe_date', (q) => q.eq('recipeId', recipeId).lte('date', today))
    .order('desc')
    .first();
  const next = await ctx.db
    .query('mealPlanEntries')
    .withIndex('by_recipe_date', (q) => q.eq('recipeId', recipeId).gt('date', today))
    .first();
  return { lastCooked: last?.date ?? null, nextPlanned: next?.date ?? null };
}

/**
 * The family's recipes by title, with when each was last cooked and next planned, and the
 * family's rating.
 */
export const list = query({
  args: { groupId: v.id('groups'), archived: v.optional(v.boolean()) },
  handler: async (ctx, { groupId, archived }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const ratingOf = await familyRatings(ctx, groupId, userId);
    const group = (await ctx.db.get('groups', groupId))!;
    const today = todayIn(group.timezone);
    const recipes = await ctx.db
      .query('recipes')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    const visible = recipes.filter((r) => (r.archivedAt !== undefined) === (archived ?? false));
    const rows = await Promise.all(
      visible.map(async (r) => ({
        _id: r._id,
        title: r.title,
        icon: recipeIcon(r),
        servings: r.servings,
        ingredientCount: r.ingredients.length,
        rating: ratingOf(r._id),
        ...(await planDates(ctx, r._id, today)),
      })),
    );
    return rows.sort((a, b) => a.title.localeCompare(b.title));
  },
});

/**
 * One recipe with its ingredients' catalog names and sections, when it was last made (and how
 * often), and each current member's stars.
 */
export const get = query({
  args: { recipeId: v.id('recipes') },
  handler: async (ctx, { recipeId }) => {
    const { doc, userId } = await loadForMember(ctx, 'recipes', recipeId);
    const ingredients = await Promise.all(
      doc.ingredients.map(async (line) => {
        const ingredient = await ctx.db.get('ingredients', line.ingredientId);
        return {
          ...line,
          name: ingredient?.name ?? '',
          section: ingredient?.section ?? 'other',
        };
      }),
    );
    const group = (await ctx.db.get('groups', doc.groupId))!;
    const today = todayIn(group.timezone);
    const cooked = await ctx.db
      .query('mealPlanEntries')
      .withIndex('by_recipe_date', (q) => q.eq('recipeId', doc._id).lte('date', today))
      .collect();

    const members = await memberIds(ctx, doc.groupId);
    const rows = await ctx.db
      .query('recipeRatings')
      .withIndex('by_recipe_user', (q) => q.eq('recipeId', doc._id))
      .collect();
    const ratings = await Promise.all(
      rows
        .filter((r) => members.has(r.userId))
        .map(async (r) => ({
          name: (await ctx.db.get('users', r.userId))?.name ?? '',
          stars: r.stars,
          isMe: r.userId === userId,
        })),
    );
    ratings.sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.stars - a.stars);
    const average =
      ratings.length === 0
        ? null
        : roundRating(ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length);

    return {
      ...doc,
      shownIcon: recipeIcon(doc),
      ingredients,
      ...(await planDates(ctx, doc._id, today)),
      timesCooked: cooked.length,
      ratings,
      rating: {
        average,
        count: ratings.length,
        mine: ratings.find((r) => r.isMe)?.stars ?? null,
      },
    };
  },
});

/** Sets the signed-in member's stars for a recipe (1-5), or clears them with null. */
export const rate = mutation({
  args: { recipeId: v.id('recipes'), stars: v.union(v.number(), v.null()) },
  handler: async (ctx, { recipeId, stars }) => {
    const { doc, userId } = await loadForMember(ctx, 'recipes', recipeId);
    if (stars !== null && !isStars(stars)) throw new ConvexError({ code: 'INVALID_RATING' });
    const existing = await ctx.db
      .query('recipeRatings')
      .withIndex('by_recipe_user', (q) => q.eq('recipeId', doc._id).eq('userId', userId))
      .unique();
    if (stars === null) {
      if (existing !== null) await ctx.db.delete('recipeRatings', existing._id);
      return;
    }
    if (existing !== null) {
      await ctx.db.patch('recipeRatings', existing._id, { stars, updatedAt: Date.now() });
      return;
    }
    await ctx.db.insert('recipeRatings', {
      groupId: doc.groupId,
      recipeId: doc._id,
      userId,
      stars,
      updatedAt: Date.now(),
    });
  },
});

const ingredientInput = v.object({
  ingredientId: v.optional(v.id('ingredients')),
  name: v.string(),
  qty: v.optional(v.number()),
  unit: v.optional(v.string()),
  note: v.optional(v.string()),
});

/**
 * Creates a recipe, or updates one and re-syncs the grocery rows of dinners planned for today or
 * later (Product plan §5.3). Ingredients typed by name join the family catalog.
 */
export const save = mutation({
  args: {
    groupId: v.id('groups'),
    recipeId: v.optional(v.id('recipes')),
    title: v.string(),
    icon: v.optional(v.string()),
    servings: v.number(),
    steps: v.array(v.string()),
    ingredients: v.array(ingredientInput),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    let existing: Doc<'recipes'> | null = null;
    if (args.recipeId !== undefined) {
      existing = (await loadForMember(ctx, 'recipes', args.recipeId)).doc;
      // The recipe must stay in the family it was loaded for.
      if (existing.groupId !== args.groupId) throw new ConvexError({ code: 'NOT_FOUND' });
    }

    const title = cleanName(args.title).slice(0, 120);
    if (title === '') throw new ConvexError({ code: 'TITLE_REQUIRED' });
    if (!Number.isInteger(args.servings) || args.servings < 1 || args.servings > 50) {
      throw new ConvexError({ code: 'INVALID_SERVINGS' });
    }
    if (args.ingredients.length > MAX_INGREDIENTS || args.steps.length > MAX_STEPS) {
      throw new ConvexError({ code: 'TOO_LONG' });
    }

    const ingredients = [];
    for (const line of args.ingredients) {
      if (line.ingredientId === undefined && line.name.trim() === '') continue;
      const ingredient = await resolveIngredient(ctx, args.groupId, line);
      const qty =
        line.qty !== undefined && Number.isFinite(line.qty) && line.qty > 0 ? line.qty : undefined;
      const unit = line.unit !== undefined && isUnit(line.unit) ? line.unit : undefined;
      const note = line.note?.trim().slice(0, 80) || undefined;
      ingredients.push({ ingredientId: ingredient._id, qty, unit, note });
    }
    const steps = args.steps.map((s) => s.trim().slice(0, 2000)).filter((s) => s !== '');
    // A missing icon keeps the current one (older app builds don't send it); '' or an unknown
    // value clears it back to the title's guess.
    const icon =
      args.icon === undefined ? existing?.icon : isRecipeIcon(args.icon) ? args.icon : undefined;
    // jev's guess belongs to the title it was asked about.
    const guessedIcon = existing?.title === title ? existing.guessedIcon : undefined;
    const fields = {
      title,
      icon,
      guessedIcon,
      servings: args.servings,
      steps,
      ingredients,
      updatedAt: Date.now(),
    };

    // jev is asked once per title, whatever it answered (or if it failed).
    const askJev =
      icon === undefined && existing?.iconAskedFor !== title && guessIcon(title) === DEFAULT_ICON;

    if (existing === null) {
      const recipeId = await ctx.db.insert('recipes', {
        ...fields,
        groupId: args.groupId,
        tags: [],
        createdBy: userId,
      });
      if (askJev) await scheduleIconGuess(ctx, args.groupId, recipeId, title);
      return recipeId;
    }

    await ctx.db.patch('recipes', existing._id, fields);
    if (askJev) await scheduleIconGuess(ctx, args.groupId, existing._id, title);
    const group = (await ctx.db.get('groups', args.groupId))!;
    const today = todayIn(group.timezone);
    const upcoming = await ctx.db
      .query('mealPlanEntries')
      .withIndex('by_recipe_date', (q) => q.eq('recipeId', existing._id).gte('date', today))
      .collect();
    for (const entry of upcoming) {
      if (entry.groupId === args.groupId) await syncEntry(ctx, entry, userId);
    }
    return existing._id;
  },
});

/** Archives or restores a recipe. Planned dinners and their grocery rows are left alone. */
export const setArchived = mutation({
  args: { recipeId: v.id('recipes'), archived: v.boolean() },
  handler: async (ctx, { recipeId, archived }) => {
    const { doc } = await loadForMember(ctx, 'recipes', recipeId);
    await ctx.db.patch('recipes', doc._id, { archivedAt: archived ? Date.now() : undefined });
  },
});
