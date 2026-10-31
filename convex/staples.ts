import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { resolveIngredient } from './ingredients';
import { loadForMember, requireMembership } from './lib/access';

// Staples (GRO-62): catalog items the family buys most weeks (milk, bread, coffee). They are a
// flag on the catalog item, so renames, merges and section moves carry over. Each week's grocery
// list offers the ones not on it yet (grocery.addStaples, grocery.dismissStaples).

/** The family's staples, by name. */
export async function familyStaples(ctx: QueryCtx, groupId: Id<'groups'>) {
  const items = await ctx.db
    .query('ingredients')
    .withIndex('by_group_staple', (q) => q.eq('groupId', groupId).eq('isStaple', true))
    .collect();
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/** The family's staples for the Staples screen. */
export const list = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    await requireMembership(ctx, groupId);
    return (await familyStaples(ctx, groupId)).map((i) => ({
      _id: i._id,
      name: i.name,
      section: i.section,
    }));
  },
});

/** Makes a catalog item a staple, or stops it being one. Sets absolute state. */
export const set = mutation({
  args: { ingredientId: v.id('ingredients'), staple: v.boolean() },
  handler: async (ctx, { ingredientId, staple }) => {
    const { doc } = await loadForMember(ctx, 'ingredients', ingredientId);
    if ((doc.isStaple ?? false) === staple) return;
    await ctx.db.patch('ingredients', doc._id, { isStaple: staple ? true : undefined });
  },
});

/** Adds a staple by name (or picked catalog item), creating the catalog item if it is new. */
export const add = mutation({
  args: {
    groupId: v.id('groups'),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId);
    const ingredient = await resolveIngredient(ctx, args.groupId, args);
    if (!ingredient.isStaple) await ctx.db.patch('ingredients', ingredient._id, { isStaple: true });
    return ingredient._id;
  },
});
